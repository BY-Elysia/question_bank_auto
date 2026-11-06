import type { Content, Issue, Leaf } from './content.js';

const hasAnswer = (question: Leaf) =>
  Boolean(question.answer?.text.trim() || question.answer?.explanation.trim());

/** A review hint, not a structural error or a claim that the source contains an answer. */
export function sourceAnswerCoverageIssues(contents: Content[]): Issue[] {
  return contents.flatMap((content) => {
    const question = content.question;
    if (!question?.children.length) return [];
    const hasSource = [question, ...question.children].some(
      (q) => q.answer?.origin === 'source' && hasAnswer(q),
    );
    const missing = question.children.filter((q) => !hasAnswer(q));
    if (!hasSource || !missing.length) return [];
    return [
      {
        code: 'PARTIAL_SOURCE_ANSWERS',
        severity: 'warning' as const,
        page: content.sources.at(-1)?.page ?? null,
        contentId: content.id,
        message: `本题仅部分小问有原书解答，${missing.map((q) => q.label).join('、')} 未提取到答案；请核对续页或原书是否提供，不自动推断为无答案。`,
      },
    ];
  });
}
