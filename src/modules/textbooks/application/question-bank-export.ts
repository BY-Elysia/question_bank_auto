import type { Book } from '../domain/book.js';
import type { Leaf, Question } from '../domain/content.js';
import { numberComprehensiveExercises } from '../domain/exercise-numbering.js';
const media = (text: string) => ({ text, media: [] });
const types: Record<string, string> = { fill_blank: 'SHORT_ANSWER', group: 'SHORT_ANSWER' };
/** Reference-format projection: template score 10, no fabricated rubrics or absent answers. */
export function questionBankExport(book: Book) {
  const document = structuredClone(book.document);
  numberComprehensiveExercises(document);
  const metadata = book.extractionContext?.metadata;
  function leaf(q: Leaf, id: string, chapterId: string | null, title: string) {
    const choice = ['single_choice', 'multiple_choice'].includes(q.type);
    const answerIds =
      q.answer?.text
        .trim()
        .toUpperCase()
        .split(/[\s,，、;；]+/)
        .filter(Boolean) ?? [];
    const known = new Set(q.options.map((o) => o.id.toUpperCase()));
    const compactIds =
      answerIds.length === 1 && !known.has(answerIds[0]!) ? [...answerIds[0]!] : answerIds;
    const validIds =
      compactIds.length > 0 &&
      compactIds.every((id) => known.has(id)) &&
      (q.type !== 'single_choice' || compactIds.length === 1);
    return {
      questionId: id,
      chapterId,
      nodeType: 'LEAF',
      questionType: types[q.type] ?? q.type.toUpperCase(),
      title,
      prompt: media(q.prompt),
      defaultScore: 10,
      rubric: [],
      standardAnswer: q.answer
        ? {
            ...media(q.answer.text),
            ...(q.answer.explanation ? { explanation: q.answer.explanation } : {}),
          }
        : null,
      ...(choice
        ? {
            options: q.options,
            correctOptionIds: validIds ? [...new Set(compactIds)] : [],
            allowPartial: false,
          }
        : {}),
    };
  }
  function question(q: Question, id: string, chapterId: string | null, title: string) {
    if (!q.children.length) return leaf(q, id, chapterId, title);
    const childTypes = [...new Set(q.children.map((c) => c.type))];
    return {
      questionId: id,
      chapterId,
      nodeType: 'GROUP',
      questionType:
        childTypes.length === 1
          ? (types[childTypes[0]!] ?? childTypes[0]!.toUpperCase())
          : 'SHORT_ANSWER',
      title,
      stem: media(q.prompt),
      ...(q.answer
        ? { standardAnswer: { ...media(q.answer.text), explanation: q.answer.explanation } }
        : {}),
      children: q.children.map((c, i) => ({
        ...leaf(c, `${id}_${i + 1}`, chapterId, `${title} 第${i + 1}小题`),
        orderNo: i + 1,
      })),
    };
  }
  return {
    version: 'v1.1',
    courseId: metadata?.courseId ?? '',
    documentType: 'textbook',
    textbook: {
      textbookId: metadata?.textbookId ?? book.id,
      title: metadata?.title ?? book.title,
      publisher: metadata?.publisher ?? '',
      subject: metadata?.subject ?? '',
      hasAnswer: metadata?.hasAnswer ?? false,
      ...(metadata?.answerHandlingMode ? { answerHandlingMode: metadata.answerHandlingMode } : {}),
    },
    chapters: document.sections.map((s, i) => ({
      chapterId: s.id,
      parentId: s.parentId,
      title: s.title,
      orderNo: i + 1,
    })),
    questions: document.contents
      .filter((c) => c.question)
      .map((c) => {
        const section = document.sections.find((s) => s.id === c.sectionId);
        return question(
          c.question!,
          c.id,
          c.sectionId,
          `${section?.title ?? book.title} 第${c.question!.label}题`,
        );
      }),
  };
}
