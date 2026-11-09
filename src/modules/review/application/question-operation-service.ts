import type { JobsService } from '../../jobs/application/jobs.service.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import type { ReviewService } from './review.service.js';
import type { ChangeService } from './change-service.js';
import type {
  QuestionOperations,
  QuestionOperationContext,
  QuestionTask,
  QuestionOperationResult,
} from '../ports/question-operations.js';
import { fail, DomainError } from '../../../shared/errors.js';
/** Textbook operation orchestration, shared by interactive and agent callers. */
export class QuestionOperationService implements QuestionOperations {
  constructor(
    private jobs: JobsService,
    private books: BookRepository,
    private review: ReviewService,
    private changes: ChangeService,
  ) {}
  async start(
    c: QuestionOperationContext,
    kind: 'repair' | 'answers',
    instruction: string,
  ): Promise<QuestionTask> {
    const focus = c.target;
    const book = await this.books.read(focus.workspaceId);
    // The immutable target is captured for the run. Revision may advance after this run's own commit.
    if (
      focus.revision !== undefined &&
      book.revision !== focus.revision &&
      !book.changes.some(
        (x) =>
          x.runId === c.runId &&
          x.contentId === focus.contentId &&
          x.revision === book.revision &&
          !x.undoneAt,
      )
    )
      fail(409, '题目版本已更新，请重新选择当前题目后发起修改');
    const job = await this.jobs.start(
      focus.workspaceId,
      {
        kind,
        contentIds: [focus.contentId],
        ...(kind === 'repair' ? { instruction } : {}),
        cache: 'prefix',
      },
      undefined,
      {
        key: `${c.runId}:${c.commandId ?? 'initial'}:${kind}`,
        principalId: c.principalId,
        runId: c.runId,
        contentId: focus.contentId,
        expectedRevision: book.revision,
      },
    );
    return { workspaceId: focus.workspaceId, jobId: job.id };
  }
  async cancel(c: QuestionOperationContext) {
    const focus = c.target;
    const book = await this.books.read(focus.workspaceId).catch((error: unknown) => {
      if (error instanceof DomainError && error.status === 404) return null;
      throw error;
    });
    if (!book) return;
    for (const job of book.jobs)
      if (
        job.action?.runId === c.runId &&
        ['queued', 'running', 'interrupted'].includes(job.status)
      )
        await this.jobs.cancel(book.id, job.id);
  }
  async settle(
    c: QuestionOperationContext,
    task: QuestionTask,
    signal: AbortSignal,
    authorize: () => Promise<void>,
  ): Promise<QuestionOperationResult> {
    signal.throwIfAborted();
    const focus = c.target;
    if (task.workspaceId !== focus.workspaceId) fail(403, '任务不属于当前教材');
    let job = await this.jobs.get(task.workspaceId, task.jobId);
    if (job.action?.runId !== c.runId || job.action.contentId !== focus.contentId)
      fail(403, '任务不属于当前操作');
    if (['interrupted', 'cancelled'].includes(job.status))
      job = await this.jobs.resume(task.workspaceId, task.jobId);
    let cancellation: Promise<void> | undefined;
    const abort = () => {
      cancellation = this.jobs.cancel(task.workspaceId, job.id).then(() => undefined);
      // Observe immediately; the finally block awaits and propagates cancellation failures.
      void cancellation.catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      await this.jobs.wait(job.id);
      signal.throwIfAborted();
      await authorize();
      const book = await this.books.read(task.workspaceId);
      job = await this.jobs.get(task.workspaceId, job.id);
      if (!['completed', 'needs_review'].includes(job.status))
        return { status: 'failed', jobId: job.id, error: job.error ?? '任务未完成', changes: [] };
      const proposals = book.proposals.filter(
        (p) => p.jobId === job.id && p.contentId === focus.contentId,
      );
      for (const proposal of proposals) {
        signal.throwIfAborted();
        if (proposal.status === 'pending') {
          const current = await this.books.read(task.workspaceId);
          await this.review.decide(
            task.workspaceId,
            proposal.id,
            current.revision,
            'accept',
            { actor: 'assistant', principalId: c.principalId, runId: c.runId },
            () => signal.throwIfAborted(),
          );
        }
      }
      const changes = (await this.changes.list(task.workspaceId)).filter((x) =>
        proposals.some((p) => p.id === x.id),
      );
      return {
        status: changes.length ? 'applied' : 'unchanged',
        changes: changes.map((x) => ({ id: x.id, revision: x.revision })),
        issues: job.issues,
      };
    } finally {
      signal.removeEventListener('abort', abort);
      if (signal.aborted && !cancellation) abort();
      await cancellation;
    }
  }
  async list(c: QuestionOperationContext) {
    return (await this.changes.list(c.target.workspaceId))
      .filter((x) => x.contentId === c.target.contentId)
      .slice(-5);
  }
  async undo(c: QuestionOperationContext, id: string): Promise<{ id: string; undone: true }> {
    const focus = c.target,
      book = await this.books.read(focus.workspaceId);
    const change = book.changes.find((x) => x.id === id);
    if (!change || change.contentId !== focus.contentId) fail(403, '只能撤销当前题目的修改');
    const result = await this.changes.undo(focus.workspaceId, id, book.revision);
    return { id: result.id, undone: true };
  }
}
