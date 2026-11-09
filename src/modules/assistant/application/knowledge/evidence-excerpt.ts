import type { Leaf } from '../../../textbooks/domain/content.js';
import type { CatalogQuestion } from '../../../catalog/domain/catalog.js';
/** Pure projection shared by evidence snapshots; never changes the source question. */
export function evidenceExcerpt(q: CatalogQuestion): string {
  const render = (item: Leaf) =>
    [
      item.prompt,
      ...item.options.map((o) => `${o.id}. ${o.text}`),
      item.answer
        ? `答案来源：${{ source: '教材原文', ai_generated: 'AI 生成', human: '人工修改' }[item.answer.origin]} · ${item.answer.review === 'pending' ? '待确认' : '已确认'}\n\n${item.answer.text}\n\n${item.answer.explanation}`
        : '无已保存答案',
    ].join('\n\n');
  const full = [
    q.parentPrompt,
    render(q.question),
    ...('children' in q.question ? q.question.children.map((c) => `${c.label}\n${render(c)}`) : []),
  ]
    .filter(Boolean)
    .join('\n\n');
  return full.length > 6000 ? full.slice(0, 6000) + '\n（原文节选）' : full;
}
