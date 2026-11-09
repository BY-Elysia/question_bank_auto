import { isQuestionCategory } from '../domain/exercise-numbering.js';
import type { Document } from '../domain/content.js';
import { fail } from '../../../shared/errors.js';

function ordinal(value: string): number | undefined {
  const text = value.normalize('NFKC');
  if (/^\d+$/.test(text)) return Number(text) || undefined;
  const digits = '零一二三四五六七八九';
  let total = 0,
    digit = 0;
  for (const char of text) {
    if (digits.includes(char)) digit = digits.indexOf(char);
    else if (char === '两') digit = 2;
    else {
      const unit = ({ 十: 10, 百: 100, 千: 1000 } as Record<string, number>)[char];
      if (!unit) return undefined;
      total += (digit || 1) * unit;
      digit = 0;
    }
  }
  return total + digit || undefined;
}
function sectionNumber(title: string, root: boolean) {
  const text = title.normalize('NFKC').trim();
  const marker = root
    ? /^第\s*([\d零一二三四五六七八九十百千两]+)\s*[章篇部]/
    : /^第\s*([\d零一二三四五六七八九十百千两]+)\s*节/;
  const match = text.match(marker);
  if (match) return ordinal(match[1]!);
  const exercise = text.match(/^(?:习题\s*)?(\d+(?:\.\d+)+)(?:\s|$)/);
  return exercise ? Number(exercise[1]!.split('.').at(-1)) || undefined : undefined;
}
/** Export-local identities: internal IDs remain stable for edits, citations and history. */
export function exportIdentities(document: Document) {
  const sections = new Map(document.sections.map((s) => [s.id, s]));
  const chapters: { chapterId: string; parentId: string | null; title: string; orderNo: number }[] =
    [];
  const mapped = new Map<string, { id: string; path: number[] }>();
  const visiting = new Set<string>();
  const orders = new Map<string, number>();
  const parents = new Set(document.sections.map((s) => s.parentId));
  for (const parent of parents) {
    const siblings = document.sections.filter(
      (s) => s.parentId === parent && !isQuestionCategory(s.title),
    );
    const reserved = new Set(
      siblings
        .map((s) => sectionNumber(s.title, parent === null))
        .filter((n): n is number => n !== undefined),
    );
    const used = new Set<number>();
    let previous = 0;
    for (const s of siblings) {
      let number = sectionNumber(s.title, parent === null);
      if (number === undefined || used.has(number)) {
        number = previous + 1;
        while (used.has(number) || reserved.has(number)) number++;
      }
      orders.set(s.id, number);
      used.add(number);
      previous = number;
    }
  }
  function unsectioned() {
    if (!chapters.some((s) => s.chapterId === 'ch_0'))
      chapters.push({ chapterId: 'ch_0', parentId: null, title: '未分节题目', orderNo: 0 });
    return { id: 'ch_0', path: [0] };
  }
  function resolve(id: string): { id: string; path: number[] } {
    const cached = mapped.get(id);
    if (cached) return cached;
    const s = sections.get(id);
    if (!s || visiting.has(id)) fail(422, '章节引用无效，无法生成题库编号');
    visiting.add(id);
    const parent = s.parentId ? resolve(s.parentId) : null;
    if (isQuestionCategory(s.title)) {
      const entry = parent ?? unsectioned();
      mapped.set(id, entry);
      visiting.delete(id);
      return entry;
    }
    let number = orders.get(id)!;
    while (
      chapters.some((c) => c.chapterId === `ch_${[...(parent?.path ?? []), number].join('_')}`)
    )
      number++;
    const path = [...(parent?.path ?? []), number];
    const entry = { id: `ch_${path.join('_')}`, path };
    mapped.set(id, entry);
    visiting.delete(id);
    chapters.push({
      chapterId: entry.id,
      parentId: parent?.id ?? null,
      title: s.title,
      orderNo: number,
    });
    return entry;
  }
  for (const s of document.sections) resolve(s.id);
  const questions = new Map<string, { id: string; chapterId: string; number: number }>();
  const counts = new Map<string, number>();
  for (const c of document.contents) {
    if (!c.question) continue;
    const section = c.sectionId ? resolve(c.sectionId) : unsectioned();
    const number = (counts.get(section.id) ?? 0) + 1;
    counts.set(section.id, number);
    // Reserve a zero segment for questions directly under a non-leaf chapter.
    // This prevents their child IDs colliding with questions in a subsection.
    const path = [
      ...section.path,
      ...(document.sections.some(
        (s) => !isQuestionCategory(s.title) && s.parentId && resolve(s.parentId).id === section.id,
      )
        ? [0]
        : []),
      number,
    ];
    questions.set(c.id, { id: `q_${path.join('_')}`, chapterId: section.id, number });
  }
  return { chapters, questions };
}
