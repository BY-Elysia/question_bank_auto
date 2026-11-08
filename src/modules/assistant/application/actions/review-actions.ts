import type { KnowledgeService } from '../knowledge/knowledge-service.js';
import type { JobsService } from '../../../jobs/application/jobs.service.js';
import type { BookRepository } from '../../../textbooks/ports/book.repository.js';
import type { ReviewService } from '../../../review/application/review.service.js';
import type { ChangeService } from '../../../review/application/change-service.js';
import type { ToolContext } from '../../domain/knowledge.js';
import type { DeferredTasks, DeferredTask } from '../../ports/deferred-tasks.js';
import { fail } from '../../../../shared/errors.js';
/** The assistant adapter delegates generation to the same textbook jobs and commits through ReviewService. */
export class ReviewActions implements DeferredTasks {
  constructor(
    private knowledge: KnowledgeService,
    private jobs: JobsService,
    private books: BookRepository,
    private review: ReviewService,
    readonly changes: ChangeService,
  ) {}
  private async target(c: ToolContext) {
    await this.knowledge.validate(c);
    if (!c.scope.allowEdits || !c.scope.focus) fail(403, '请在教材中选择题目并启用修改模式');
    const focus = c.scope.focus;
    await this.knowledge.query.read(c.principalId, c.scope.workspaceIds, focus.workspaceId);
    return focus;
  }
  async start(
    c: ToolContext,
    kind: 'repair' | 'answers',
    instruction: string,
  ): Promise<DeferredTask> {
    const focus = await this.target(c);
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
  async cancel(c: ToolContext) {
    const focus = c.scope.focus;
    if (!focus) return;
    const book = await this.books.read(focus.workspaceId);
    for (const job of book.jobs)
      if (
        job.action?.runId === c.runId &&
        ['queued', 'running', 'interrupted'].includes(job.status)
      )
        await this.jobs.cancel(book.id, job.id);
  }
  async settle(c: ToolContext, task: DeferredTask, signal: AbortSignal) {
    const focus = await this.target(c);
    if (task.workspaceId !== focus.workspaceId) fail(403, '任务不属于当前教材');
    let job = await this.jobs.get(task.workspaceId, task.jobId);
    if (job.action?.runId !== c.runId || job.action.contentId !== focus.contentId)
      fail(403, '任务不属于当前操作');
    if (['interrupted', 'cancelled'].includes(job.status))
      job = await this.jobs.resume(task.workspaceId, task.jobId);
    const abort = () => {
      void this.jobs.cancel(task.workspaceId, job.id);
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      await this.jobs.wait(job.id);
      signal.throwIfAborted();
      await this.knowledge.validate(c);
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
      const changes = (await this.changes.list(task.workspaceId)).filter(
        (x) => x.runId === c.runId,
      );
      this.knowledge.notify(c, 'workspace_changed', {
        workspaceId: task.workspaceId,
        contentId: focus.contentId,
      });
      return {
        status: changes.length ? 'applied' : 'unchanged',
        changes: changes.map((x) => ({ id: x.id, revision: x.revision })),
        issues: job.issues,
      };
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  async undo(c: ToolContext, id: string) {
    const focus = await this.target(c),
      book = await this.books.read(focus.workspaceId);
    const change = book.changes.find((x) => x.id === id);
    if (!change || change.contentId !== focus.contentId) fail(403, '只能撤销当前题目的修改');
    const result = await this.changes.undo(focus.workspaceId, id, book.revision);
    this.knowledge.notify(c, 'workspace_changed', {
      workspaceId: focus.workspaceId,
      contentId: focus.contentId,
    });
    return { id: result.id, undone: true };
  }
}
