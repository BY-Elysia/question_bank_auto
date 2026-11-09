import type { ActionContext } from '../../ports/action-context.js';
import type {
  QuestionOperations,
  QuestionOperationContext,
} from '../../../review/ports/question-operations.js';
import type { ToolContext } from '../../domain/knowledge.js';
import type { DeferredTasks, DeferredTask } from '../../ports/deferred-tasks.js';
import { fail } from '../../../../shared/errors.js';
/** Assistant adapter: authorize the selected target and publish committed mutations. */
export class ReviewActions implements DeferredTasks {
  constructor(
    private knowledge: ActionContext,
    private operations: QuestionOperations,
  ) {}
  private async target(c: ToolContext): Promise<QuestionOperationContext> {
    await this.knowledge.validate(c);
    if (!c.scope.allowEdits || !c.scope.focus) fail(403, '请在教材中选择题目并启用修改模式');
    return {
      target: c.scope.focus,
      principalId: c.principalId,
      runId: c.runId,
      commandId: c.commandId,
    };
  }
  private changed(c: ToolContext) {
    this.knowledge.notify(c, 'workspace_changed', {
      workspaceId: c.scope.focus!.workspaceId,
      contentId: c.scope.focus!.contentId,
    });
  }
  async start(c: ToolContext, kind: 'repair' | 'answers', instruction: string) {
    return this.operations.start(await this.target(c), kind, instruction);
  }
  async cancel(c: ToolContext) {
    if (!c.scope.allowEdits || !c.scope.focus) return;
    await this.operations.cancel({
      target: c.scope.focus,
      principalId: c.principalId,
      runId: c.runId,
    });
  }
  async settle(c: ToolContext, task: DeferredTask, signal: AbortSignal) {
    const result = await this.operations.settle(await this.target(c), task, signal, () =>
      this.knowledge.validate(c),
    );
    if (result.status === 'applied') this.changed(c);
    return result;
  }
  async list(c: ToolContext) {
    return this.operations.list(await this.target(c));
  }
  async undo(c: ToolContext, id: string) {
    const result = await this.operations.undo(await this.target(c), id);
    this.changed(c);
    return result;
  }
}
