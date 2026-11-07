import { z } from 'zod';
import {
  QuestionReference,
  questionReference,
  questionAddress,
} from '../../../catalog/domain/question-reference.js';
import type { AssistantTool, AssistantToolRegistry } from '../../ports/tools.js';
import type { ToolContext } from '../../domain/knowledge.js';
import type { KnowledgeService } from '../knowledge/knowledge-service.js';
import { QuestionAddress, QuestionSearch } from '../../../catalog/domain/catalog.js';
import { ReadToolExecutor } from './tool-executor.js';
export class CatalogTools implements AssistantToolRegistry {
  constructor(
    private knowledge: KnowledgeService,
    private interaction: AssistantToolRegistry,
  ) {}
  tools(context?: ToolContext): AssistantTool[] {
    const tools = this.interaction.tools(context);
    if (!context) return tools;
    const k = this.knowledge;
    const addressSchema = z.object({ questionRef: QuestionReference });
    const detail = async (args: z.infer<typeof addressSchema>, c: ToolContext) => {
      const q = await k.query.question(
        c.principalId,
        c.scope.workspaceIds,
        questionAddress(args.questionRef),
      );
      return { question: q, evidence: k.register(c, q) };
    };
    const executor = new ReadToolExecutor(k);
    return [
      ...tools,
      executor.define(context, {
        name: 'list_workspaces',
        label: '查看可用教材',
        description: '列出账号可用工作区摘要。读取题目必须由用户在界面选入本次资料范围。',
        schema: z.object({}),
        execute: async (_a, c) => ({
          workspaces: await k.query.list(c.principalId),
          selected: c.scope.workspaceIds,
        }),
      }),
      executor.define(context, {
        name: 'get_workspace_outline',
        label: '读取教材目录',
        description: '读取选定工作区的章节、修订号和已发布题目统计。',
        schema: z.object({ workspaceId: QuestionAddress.shape.workspaceId }),
        execute: async (a, c) =>
          k.query.outline(c.principalId, c.scope.workspaceIds, a.workspaceId),
      }),
      executor.define(context, {
        name: 'search_questions',
        label: '查询题目',
        description:
          '在本次选定教材内按关键词、章节、题型和答案状态查询。query 用简短关键词；多词为空格分隔且同时匹配。返回摘要，引用前应 get_question 获取完整题目和 evidenceId。',
        schema: QuestionSearch,
        execute: async (a, c) => {
          const r = await k.query.search(c.principalId, c.scope.workspaceIds, a);
          return {
            ...r,
            items: r.items.map((q) => ({
              questionRef: questionReference(q),
              workspaceId: q.workspaceId,
              contentId: q.contentId,
              childIndex: q.childIndex,
              revision: q.revision,
              title: q.title,
              section: q.section,
              label: q.label,
              type: q.question.type,
              prompt: q.question.prompt.slice(0, 250),
              answerOrigin: q.question.answer?.origin ?? null,
              answerReview: q.question.answer?.review ?? null,
            })),
          };
        },
      }),
      executor.define(context, {
        name: 'get_question',
        label: '读取完整题目',
        description:
          '读取题干、选项、子题、答案与来源。questionRef 必须原样复制搜索结果或用户选中题目的定位，不要重建 ID 或子题索引。引用使用返回的 evidence.id，格式 [来源:e_...]。',
        schema: addressSchema,
        execute: detail,
      }),
      executor.define(context, {
        name: 'get_source_excerpt',
        label: '定位原文来源',
        description:
          '获取选定题目的识别原文、页码和来源框。原文是识别结果而非模型直接看图；AI 生成答案不能称为教材原答案。',
        schema: addressSchema,
        execute: async (a, c) => {
          const r = await detail(a, c);
          return { evidence: r.evidence };
        },
      }),
    ];
  }
}
