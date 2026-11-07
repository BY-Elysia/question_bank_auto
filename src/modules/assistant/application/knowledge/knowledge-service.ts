import { questionReference } from '../../../catalog/domain/question-reference.js';
import type { QuestionAddress } from '../../../catalog/domain/catalog.js';
import type { Leaf } from '../../../textbooks/domain/content.js';
import type { PageImagePort } from '../../../textbooks/ports/assets.port.js';
import { randomUUID } from 'node:crypto';
import type { KnowledgeStore, KnowledgeLifecycle } from '../../ports/knowledge.js';
import type { HarnessStore } from '../../ports/harness-store.js';
import type { CatalogQuery } from '../../../catalog/application/catalog-query.js';
import type { CatalogQuestion } from '../../../catalog/domain/catalog.js';
import type { SkillCatalog } from '../../../../ai/ports/skill-catalog.js';
import { Citation, type ToolContext, type CitationView } from '../../domain/knowledge.js';
import { fail, DomainError } from '../../../../shared/errors.js';
export class KnowledgeService implements KnowledgeLifecycle {
  constructor(
    readonly principalId: string,
    private store: KnowledgeStore,
    private harness: HarnessStore,
    readonly query: CatalogQuery,
    private skills: SkillCatalog,
    private images?: PageImagePort,
  ) {}
  scope(id: string) {
    this.harness.get(id);
    return this.store.scope(id);
  }
  async setScope(id: string, workspaceIds: string[], focus: QuestionAddress | null = null) {
    const session = this.harness.get(id);
    if (session.runs.some((r) => ['queued', 'running', 'waiting_input'].includes(r.status)))
      fail(409, '请先停止当前任务，再修改资料范围');
    const unique = [...new Set(workspaceIds)].sort();
    await this.query.authorize(this.principalId, unique);
    if (focus) await this.query.question(this.principalId, unique, focus);
    // Recheck after asynchronous authorization so a newly started Run cannot race a scope change.
    const latest = this.harness.get(id);
    if (latest.runs.some((r) => ['queued', 'running', 'waiting_input'].includes(r.status)))
      fail(409, '当前任务正在运行');
    const previous = this.store.scope(id);
    if (
      JSON.stringify(previous.workspaceIds) === JSON.stringify(unique) &&
      JSON.stringify(previous.focus ?? null) === JSON.stringify(focus)
    )
      return previous;
    const scope = {
      workspaceIds: unique,
      focus,
      epoch: previous.epoch + 1,
      historyStart: latest.conversation.messages.length,
    };
    this.store.saveScope(id, scope);
    return scope;
  }
  async prepare(id: string) {
    const scope = this.scope(id);
    await this.query.authorize(this.principalId, scope.workspaceIds);
    const selected = scope.focus
      ? await this.query.question(this.principalId, scope.workspaceIds, {
          ...scope.focus,
          revision: undefined,
        })
      : null;
    const focusInstructions = selected
      ? `\n用户选中的题目定位：${JSON.stringify({ questionRef: questionReference(selected) })}。用户所说的“这道题”指向这个定位。`
      : '';
    const skill = scope.workspaceIds.length ? await this.skills.get('textbook-research') : null;
    return {
      scope,
      principalId: this.principalId,
      instructions: skill
        ? `${skill.instructions}\n本次允许读取的工作区 ID：${JSON.stringify(scope.workspaceIds)}${focusInstructions}`
        : '',
    };
  }
  async validate(c: ToolContext) {
    if (c.principalId !== this.principalId) fail(403, '无权读取资料');
    const run = this.harness.get(c.conversationId).runs.find((r) => r.id === c.runId);
    if (
      !run ||
      run.execution?.principalId !== c.principalId ||
      !['running', 'queued'].includes(run.status)
    )
      fail(409, '资料查询任务已结束');
    const current = this.scope(c.conversationId);
    if (
      current.epoch !== c.scope.epoch ||
      JSON.stringify(current.workspaceIds) !== JSON.stringify(c.scope.workspaceIds)
    )
      fail(409, '资料范围已变化，请重新提问');
    await this.query.authorize(c.principalId, c.scope.workspaceIds);
  }
  register(c: ToolContext, q: CatalogQuestion) {
    const a = q.question.answer;
    const render = (item: Leaf) =>
      [
        item.prompt,
        ...item.options.map((o) => `${o.id}. ${o.text}`),
        item.answer
          ? `答案来源：${item.answer.origin}；审核：${item.answer.review}\n${item.answer.text}\n${item.answer.explanation}`
          : '无已保存答案',
      ].join('\n');
    const full = [
      q.parentPrompt,
      render(q.question),
      ...('children' in q.question
        ? q.question.children.map((c) => `${c.label}\n${render(c)}`)
        : []),
    ]
      .filter(Boolean)
      .join('\n');
    const excerpt = full.length > 6000 ? full.slice(0, 6000) + '\n（原文节选）' : full;
    const e = {
      id: 'e_' + randomUUID(),
      workspaceId: q.workspaceId,
      contentId: q.contentId,
      childIndex: q.childIndex,
      revision: q.revision,
      title: q.title,
      label: q.label,
      section: q.section,
      sources: q.sources,
      excerpt,
      answerOrigin: a?.origin ?? null,
      answerReview: a?.review ?? null,
      conversationId: c.conversationId,
      runId: c.runId,
      scopeEpoch: c.scope.epoch,
    };
    this.store.evidence(e);
    return Citation.parse(e);
  }
  async citations(c: ToolContext, text: string) {
    await this.validate(c);
    const ids = [...new Set([...text.matchAll(/\[来源:([a-zA-Z0-9_-]+)\]/g)].map((m) => m[1]!))],
      citations = [];
    for (const id of ids) {
      const e = this.store.getEvidence(id);
      if (
        e &&
        e.runId === c.runId &&
        e.conversationId === c.conversationId &&
        e.scopeEpoch === c.scope.epoch &&
        c.scope.workspaceIds.includes(e.workspaceId)
      )
        citations.push(Citation.parse(e));
      else text = text.split(`[来源:${id}]`).join('[来源未验证]');
    }
    return { text, citations };
  }
  async citation(conversationId: string, id: string): Promise<CitationView> {
    const scope = this.scope(conversationId),
      e = this.store.getEvidence(id);
    if (!e || e.conversationId !== conversationId) fail(404, '来源不存在');
    if (!scope.workspaceIds.includes(e.workspaceId)) fail(403, '来源不在当前资料范围');
    try {
      const { book } = await this.query.read(this.principalId, scope.workspaceIds, e.workspaceId);
      return {
        citation: Citation.parse(e),
        currentRevision: book.revision,
        status: book.revision === e.revision ? 'current' : 'changed',
      };
    } catch (error) {
      if (error instanceof DomainError && error.status === 404)
        return { citation: Citation.parse(e), currentRevision: null, status: 'deleted' };
      throw error;
    }
  }
  async image(conversationId: string, id: string, page: number) {
    const view = await this.citation(conversationId, id);
    if (view.status === 'deleted' || !this.images) fail(404, '来源图片不存在');
    if (!view.citation.sources.some((s) => s.page === page)) fail(403, '页码不属于此来源');
    return this.images.read(view.citation.workspaceId, page, undefined, 'preview');
  }
  calls(c: ToolContext) {
    return this.store.calls(c.runId);
  }
  record(
    c: ToolContext,
    id: string,
    name: string,
    status: string,
    args: unknown,
    result?: unknown,
  ) {
    const key = `${c.step ?? 0}:${id}`;
    this.store.call(c, key, name, status, args, result);
    this.harness.update(c.conversationId, (_s, emit) =>
      emit(c.runId, 'tool_status', { callId: key, name, status }),
    );
  }
  remove(id: string) {
    this.store.remove(id);
  }
  close() {
    this.store.close();
    this.query.close();
  }
}
