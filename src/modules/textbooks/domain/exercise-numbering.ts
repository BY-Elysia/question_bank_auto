import type { Document } from './content.js';

/** A category caption has no shared mathematical premise. */
export function isQuestionCategory(text: string) {
  return /^(?:[一二三四五六七八九十百\d]+[.．、:：])?(?:(?:单项|多项|单选|多选)?选择|填空|填空选择|选择填空)题[。:：]?$/u.test(
    text.replace(/\s/g, ''),
  );
}

/** Category-based exercises are independent questions, numbered by document order.
 * Source labels stay available for traceability; inserted questions keep their chosen position.
 */
export function numberComprehensiveExercises(document: Document) {
  const sections = new Map(document.sections.map((s) => [s.id, s]));
  function scope(id: string | null): string {
    let section = id ? sections.get(id) : undefined;
    const seen = new Set<string>();
    while (section && !seen.has(section.id)) {
      seen.add(section.id);
      if (/综合(?:练习|习题|测试)/u.test(section.title)) return section.id;
      if (isQuestionCategory(section.title)) return section.parentId ?? '__book__';
      section = section.parentId ? sections.get(section.parentId) : undefined;
    }
    return id ?? '__book__';
  }
  const numbered = new Set<string>();
  for (const c of document.contents) {
    if (
      c.question &&
      (['single_choice', 'multiple_choice', 'fill_blank'].includes(c.question.type) ||
        /综合(?:练习|习题|测试)/u.test(sections.get(scope(c.sectionId))?.title ?? ''))
    )
      numbered.add(scope(c.sectionId));
  }
  const counts = new Map<string, number>();
  for (const c of document.contents) {
    if (!c.question || c.kind !== 'question') continue;
    const key = scope(c.sectionId);
    if (!numbered.has(key)) continue;
    const number = (counts.get(key) ?? 0) + 1;
    counts.set(key, number);
    c.question.sourceLabel ??= c.question.label;
    c.question.label = String(number);
  }
}
