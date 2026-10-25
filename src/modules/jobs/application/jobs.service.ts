import { randomUUID } from 'node:crypto';
import type { Book } from '../../textbooks/domain/book.js';
import { emptyDocument } from '../../textbooks/domain/book.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import type { JobRequest, Job } from '../domain/job.js';
import type { JobHandlers } from '../ports/job-handler.js';
import { fail, message } from '../../../shared/errors.js';
import { addEvent } from './job-events.js';
export class JobsService {
  private running = new Map<string, { abort: AbortController; promise: Promise<void> }>();
  constructor(
    private store: BookRepository,
    private handlers: JobHandlers,
  ) {}
  async recover() {
    for (const book of await this.store.list())
      if (book.jobs.some((j) => ['queued', 'running'].includes(j.status))) {
        await this.store.update(book.id, (current) => {
          for (const job of current.jobs)
            if (['queued', 'running'].includes(job.status)) {
              job.status = 'interrupted';
              addEvent(job, 'Process restarted; resume explicitly from persisted checkpoint');
            }
        });
      }
  }
  async start(id: string, request: JobRequest) {
    if (!this.handlers.has(request.kind)) fail(400, 'Unsupported job kind');
    const jobId = randomUUID();
    const book = await this.store.update(id, (book) => {
      if (book.jobs.some((j) => ['queued', 'running'].includes(j.status)))
        fail(409, 'A task is already active for this textbook');
      if (request.kind === 'answers' && book.document.processedPages.length !== book.pages.length)
        fail(409, 'Parse the entire textbook before generating missing answers');
      if (
        request.kind === 'parse' &&
        (request.contentIds || request.sectionId || request.instruction)
      )
        fail(400, 'Parse accepts page selection, not content or repair filters');
      if (request.kind !== 'parse' && request.generateAnswers !== undefined)
        fail(400, 'generateAnswers is only valid on parse jobs');
      if (request.kind === 'repair' && (!request.instruction || !request.contentIds?.length))
        fail(400, 'Repair requires instruction and contentIds');
      if (request.contentIds?.some((id) => !book.document.contents.some((c) => c.id === id)))
        fail(400, 'Unknown content ID');
      if (request.sectionId && !book.document.sections.some((s) => s.id === request.sectionId))
        fail(400, 'Unknown section ID');
      let startPage = request.startPage ?? 1,
        endPage = request.endPage ?? book.pages.length;
      if (endPage < startPage || endPage > book.pages.length || startPage > book.pages.length)
        fail(400, 'Invalid page range');
      // Expand a reparse to include every existing block that crosses the selected range.
      if (request.kind === 'parse') {
        let changed = true;
        while (changed) {
          changed = false;
          for (const content of book.document.contents)
            if (content.sources.some((s) => s.page >= startPage && s.page <= endPage)) {
              const min = Math.min(startPage, ...content.sources.map((s) => s.page)),
                max = Math.max(endPage, ...content.sources.map((s) => s.page));
              if (min !== startPage || max !== endPage) {
                startPage = min;
                endPage = max;
                changed = true;
              }
            }
        }
      }
      const whole = startPage === 1 && endPage === book.pages.length;
      const stage =
        request.kind === 'parse'
          ? whole
            ? emptyDocument()
            : structuredClone(book.document)
          : null;
      if (stage && !whole) {
        stage.contents = stage.contents.filter(
          (c) => !c.sources.some((s) => s.page >= startPage && s.page <= endPage),
        );
        stage.processedPages = stage.processedPages.filter((p) => p < startPage || p > endPage);
        stage.issues = stage.issues.filter(
          (i) => i.page !== null && (i.page < startPage || i.page > endPage),
        );
      }
      const now = new Date().toISOString();
      book.jobs.push({
        id: jobId,
        kind: request.kind,
        request,
        status: 'queued',
        phase: request.kind === 'parse' ? 'parse' : 'review',
        baseRevision: book.revision,
        cursor: startPage,
        startPage,
        endPage,
        pending: [],
        activeSectionId: null,
        stage,
        processedIds: [],
        issues: [],
        error: null,
        createdAt: now,
        updatedAt: now,
        events: [],
      });
    });
    this.launch(id, jobId);
    return book.jobs.find((j) => j.id === jobId)!;
  }
  private launch(bookId: string, jobId: string) {
    const abort = new AbortController();
    const promise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.run(bookId, jobId, abort.signal))
      .finally(() => {
        this.running.delete(jobId);
      });
    this.running.set(jobId, { abort, promise });
  }
  private async run(bookId: string, jobId: string, signal: AbortSignal) {
    try {
      await this.store.update(bookId, (book) => {
        const job = this.find(book, jobId);
        job.status = 'running';
        job.error = null;
        addEvent(job, 'Started');
      });
      signal.throwIfAborted();
      const context = { bookId, jobId, signal };
      const job = this.find(await this.store.read(bookId), jobId);
      const handler = this.handlers.get(job.kind);
      if (!handler) throw new Error('No handler registered for job');
      await handler.execute(context);
      signal.throwIfAborted();
      await this.store.update(bookId, (book) => {
        const job = this.find(book, jobId);
        job.status =
          job.issues.length ||
          job.pending.length ||
          book.proposals.some((p) => p.jobId === jobId && p.status === 'pending') ||
          (job.kind === 'parse' && book.document.issues.length)
            ? 'needs_review'
            : 'completed';
        addEvent(job, job.status);
      });
    } catch (error) {
      await this.store.update(bookId, (book) => {
        const job = this.find(book, jobId);
        job.status = signal.aborted ? 'cancelled' : 'failed';
        job.error = signal.aborted ? 'Cancelled' : message(error);
        addEvent(job, job.error);
      });
    }
  }
  async get(bookId: string, id: string) {
    return this.find(await this.store.read(bookId), id);
  }
  async list(bookId: string) {
    return (await this.store.read(bookId)).jobs.map(({ stage, ...job }) => job);
  }
  find(book: Book, id: string): Job {
    const job = book.jobs.find((j) => j.id === id);
    if (!job) fail(404, 'Job not found');
    return job;
  }
  async cancel(id: string, jobId: string) {
    const job = this.find(await this.store.read(id), jobId);
    const running = this.running.get(jobId);
    if (running) {
      running.abort.abort();
      await running.promise;
    } else if (['queued', 'running', 'interrupted', 'failed'].includes(job.status))
      await this.store.update(id, (book) => {
        this.find(book, jobId).status = 'cancelled';
      });
    return this.find(await this.store.read(id), jobId);
  }
  async resume(id: string, jobId: string) {
    await this.store.update(id, (book) => {
      if (book.jobs.some((j) => ['queued', 'running'].includes(j.status)))
        fail(409, 'A task is active');
      const job = this.find(book, jobId);
      if (!['failed', 'interrupted', 'cancelled'].includes(job.status))
        fail(409, 'Task is not resumable');
      if (job.baseRevision !== book.revision) fail(409, 'Document changed; create a new task');
      job.status = 'queued';
      job.error = null;
    });
    this.launch(id, jobId);
    return this.find(await this.store.read(id), jobId);
  }
  async shutdown() {
    for (const run of this.running.values()) run.abort.abort();
    await Promise.allSettled([...this.running.values()].map((r) => r.promise));
  }
  async wait(jobId: string) {
    await this.running.get(jobId)?.promise;
  }
}
