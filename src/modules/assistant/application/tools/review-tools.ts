import { z } from 'zod';
import type { AssistantToolRegistry } from '../../ports/tools.js';
import type { ToolContext } from '../../domain/knowledge.js';
import type { ReviewActions } from '../actions/review-actions.js';
import type { KnowledgeService } from '../knowledge/knowledge-service.js';
import { ToolExecutor } from './tool-executor.js';
export class ReviewTools implements AssistantToolRegistry {
  constructor(
    private base: AssistantToolRegistry,
    private actions: ReviewActions,
    private knowledge: KnowledgeService,
  ) {}
  tools(c?: ToolContext) {
    const base = this.base.tools(c);
    if (!c?.scope.allowEdits || !c.scope.focus) return base;
    const executor = new ToolExecutor(this.knowledge);
    const start = executor.define(c, {
      name: 'run_question_action',
      label: '处理当前题目',
      description:
        '仅当用户要求修改时调用。repair 核对原图修复当前题目，answers 补全缺失答案。任务后台执行，系统等待完成后提供结果，不要轮询。成功修改立即写入并可撤销。',
      schema: z.object({
        kind: z.enum(['repair', 'answers']),
        instruction: z.string().min(1).max(8000),
      }),
      execute: async (a) => this.actions.start(c, a.kind, a.instruction),
      present: (task) => ({ data: task, deferred: task }),
    });
    return [
      ...base,
      start,
      executor.define(c, {
        name: 'undo_question_change',
        label: '撤销题目修改',
        description: '按修改记录 ID 撤销当前题目的指定修改。发生后续编辑冲突时不覆盖。',
        schema: z.object({ changeId: z.string().min(1).max(100) }),
        execute: async (a) => this.actions.undo(c, a.changeId),
      }),
      executor.define(c, {
        name: 'list_question_changes',
        label: '读取修改记录',
        description: '读取当前题目的修改记录，包括修改前后内容及是否撤销。',
        schema: z.object({}),
        execute: async () =>
          (await this.actions.changes.list(c.scope.focus!.workspaceId))
            .filter((x) => x.contentId === c.scope.focus!.contentId)
            .slice(-5),
      }),
    ];
  }
}
