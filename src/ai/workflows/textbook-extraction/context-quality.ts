import type { Document, Issue } from '../../../modules/textbooks/domain/content.js';
import { readingOrder } from './guards.js';
/** A conservative backstop when visual seam classification disagrees with extracted reading order. */
export function contextIssues(document: Document): Issue[] {
  const contents = [...document.contents].sort(readingOrder);
  const issues: Issue[] = [];
  const first = contents[0];
  if (
    first &&
    !first.question &&
    !document.issues.some(
      (i) =>
        i.code === 'MISSING_QUESTION_START' &&
        (i.contentId === first.id || (i.contentId === null && i.page === first.sources[0]!.page)),
    ) &&
    (['answer', 'formula'].includes(first.kind) || /^\s*\$\$/u.test(first.text))
  ) {
    issues.push({
      code: 'OPENING_CONTEXT_UNCERTAIN',
      severity: 'warning',
      page: first.sources[0]!.page,
      contentId: first.id,
      message:
        'The source opens with mathematics or an answer without its question stem; check whether preceding pages are missing.',
    });
  }
  for (let i = 1; i < contents.length; i++) {
    const current = contents[i]!,
      previous = contents[i - 1]!;
    if (
      !current.question &&
      /^(综上(?:所述)?|由此可(?:知|得)|因此可得|故可得|In conclusion\b|Therefore\b)/iu.test(
        current.text.trim(),
      ) &&
      previous.question &&
      current.sources[0]!.page === previous.sources.at(-1)!.page + 1
    ) {
      issues.push({
        code: 'DETACHED_CONTINUATION',
        severity: 'warning',
        page: current.sources[0]!.page,
        contentId: current.id,
        message: `This leading summary may belong to preceding question ${previous.id}; inspect cross-page ownership. No automatic text merge was performed.`,
      });
    }
  }
  return issues;
}
