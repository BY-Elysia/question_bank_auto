import type { Document } from './content.js';

/** A category caption has no shared mathematical premise. */
export function isQuestionCategory(text: string) {
  return /^(?:[一二三四五六七八九十百\d]+[.．、:：])?(?:(?:单项|多项|单选|多选)?选择|填空|填空选择|选择填空)题[。:：]?$/u.test(
    text.replace(/\s/g, ''),
  );
}

/** Preserve printed labels while numbering independent exercises within a comprehensive section. */
export function numberComprehensiveExercises(document: Document) {
  const sections = new Map(document.sections.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  const ordered = [...document.contents].sort(
    (a, b) =>
      a.sources[0]!.page - b.sources[0]!.page ||
      a.sources[0]!.box[1] - b.sources[0]!.box[1] ||
      a.sources[0]!.box[0] - b.sources[0]!.box[0],
  );
  for (const content of ordered) {
    if (!content.question || content.kind !== 'question') continue;
    let section = content.sectionId ? sections.get(content.sectionId) : undefined;
    const seen = new Set<string>();
    while (section && !/综合(?:练习|习题|测试)/u.test(section.title)) {
      if (seen.has(section.id)) {
        section = undefined;
        break;
      }
      seen.add(section.id);
      section = section.parentId ? sections.get(section.parentId) : undefined;
    }
    if (!section) continue;
    const number = (counts.get(section.id) ?? 0) + 1;
    counts.set(section.id, number);
    content.question.sourceLabel ??= content.question.label;
    content.question.label = String(number);
  }
}
