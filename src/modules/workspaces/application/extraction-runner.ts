import type { WorkspaceRepository } from '../ports/workspace.repository.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import type { TextbooksService } from '../../textbooks/application/textbooks.service.js';
import type { JobsService } from '../../jobs/application/jobs.service.js';
import type { Workspace } from '../domain/workspace.js';
import { mergeChapters } from './merge-chapters.js';
import { fail, message } from '../../../shared/errors.js';
export class ExtractionRunner {
  constructor(
    private workspaces: WorkspaceRepository,
    private store: BookRepository,
    private books: TextbooksService,
    private jobs: JobsService,
  ) {}
  async execute(id: string, signal: AbortSignal) {
    const workspace = await this.workspaces.read(id),
      settings = workspace.settings!;
    let cursor = 0;
    const errors: unknown[] = [];
    const worker = async () => {
      while (cursor < workspace.chapters.length && !signal.aborted) {
        const chapter = workspace.chapters[cursor++]!;
        try {
          await this.chapter(workspace, chapter, signal);
        } catch (error) {
          errors.push(error);
          await this.workspaces.update(id, (w) => {
            const c = w.chapters.find((c) => c.id === chapter.id)!;
            c.status = 'failed';
            c.error = message(error);
          });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(settings.concurrency, workspace.chapters.length) }, worker),
    );
    signal.throwIfAborted();
    if (errors.length) throw new Error(`Chapter extraction failed: ${message(errors[0])}`);
    let current = await this.workspaces.read(id),
      book = await this.store.read(id);
    if (book.workspaceCommit !== current.runId) {
      const children = await Promise.all(current.chapters.map((c) => this.store.read(c.bookId)));
      const document = mergeChapters(current.chapters, children, current.totalPages);
      book = await this.store.update(
        id,
        (b) => {
          if (b.revision !== current.baseRevision || b.workflowLock !== id)
            fail(409, 'Workspace content changed before merge');
          b.document = document;
          b.workspaceCommit = current.runId;
          b.extractionContext = {
            metadata: settings.metadata,
            instructions: settings.instructions,
          };
          b.title = settings.metadata.title;
          for (const page of b.pages) {
            page.status = 'processed';
            page.blank = !document.contents.some((c) =>
              c.sources.some((s) => s.page === page.number),
            );
          }
        },
        true,
      );
    } else if (book.revision !== current.baseRevision + 1)
      fail(409, 'Workspace changed after the interrupted merge');
    current = await this.workspaces.update(id, (w) => {
      w.mergedRevision = book.revision;
    });
    const answerMode =
      settings.metadata.answerHandlingMode ??
      (settings.metadata.hasAnswer ? 'extract_visible' : 'generate_brief');
    if (answerMode !== 'leave_empty') {
      let job = current.answersJobId
        ? await this.jobs.get(id, current.answersJobId)
        : book.jobs.find((j) => j.kind === 'answers' && j.baseRevision === book.revision);
      const resume = Boolean(job);
      if (!job)
        job = await this.jobs.start(id, { kind: 'answers', cache: settings.cache, answerMode }, id);
      await this.workspaces.update(id, (w) => {
        w.answersJobId = job!.id;
      });
      await this.finishJob(id, job.id, signal, id, resume);
    }
    const final = await this.store.read(id);
    signal.throwIfAborted();
    await this.workspaces.update(id, (w) => {
      w.status =
        final.document.issues.length ||
        final.proposals.some((p) => p.status === 'pending') ||
        (w.answersJobId && final.jobs.find((j) => j.id === w.answersJobId)?.issues.length)
          ? 'needs_review'
          : 'completed';
      w.error = null;
    });
  }
  private async chapter(
    workspace: Workspace,
    chapter: Workspace['chapters'][number],
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    let book;
    try {
      book = await this.store.read(chapter.bookId);
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
      book = await this.books.copyPages(
        chapter.bookId,
        workspace.id,
        chapter.pages,
        workspace.title,
      );
    }
    await this.store.update(book.id, (b) => {
      b.extractionContext = {
        metadata: workspace.settings!.metadata,
        instructions: workspace.settings!.instructions,
      };
      b.workspaceId = workspace.id;
      b.workflowLock = workspace.id;
    });
    let job = chapter.jobId
      ? await this.jobs.get(book.id, chapter.jobId)
      : book.jobs.find((j) => j.kind === 'parse');
    const resume = Boolean(job);
    if (!job)
      job = await this.jobs.start(
        book.id,
        { kind: 'parse', generateAnswers: false, cache: workspace.settings!.cache },
        workspace.id,
      );
    await this.workspaces.update(workspace.id, (w) => {
      const c = w.chapters.find((c) => c.id === chapter.id)!;
      c.jobId = job!.id;
      c.status = 'running';
      c.error = null;
    });
    await this.finishJob(book.id, job.id, signal, workspace.id, resume);
    book = await this.store.read(book.id);
    const title = book.document.sections.find((s) => s.parentId === null)?.title ?? null;
    await this.workspaces.update(workspace.id, (w) => {
      const c = w.chapters.find((c) => c.id === chapter.id)!;
      c.title = title;
      c.status = book.document.issues.length || !title ? 'needs_review' : 'completed';
    });
  }
  private async finishJob(
    bookId: string,
    jobId: string,
    signal: AbortSignal,
    owner: string,
    resume: boolean,
  ) {
    signal.throwIfAborted();
    let job = await this.jobs.get(bookId, jobId);
    if (resume && ['failed', 'cancelled', 'interrupted'].includes(job.status))
      job = await this.jobs.resume(bookId, jobId, owner);
    const abort = () => {
      void this.jobs.cancel(bookId, jobId).catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    try {
      await this.jobs.wait(jobId);
      signal.throwIfAborted();
      job = await this.jobs.get(bookId, jobId);
      if (!['completed', 'needs_review'].includes(job.status))
        throw new Error(job.error ?? 'Chapter task did not complete');
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
}
