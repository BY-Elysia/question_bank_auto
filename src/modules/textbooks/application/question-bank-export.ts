import { scoringReadiness } from '../domain/grading.js';
import { fail } from '../../../shared/errors.js';
import { exportIdentities } from './export-identities.js';
import type { Book } from '../domain/book.js';
import type { Leaf, Question } from '../domain/content.js';
import { numberComprehensiveExercises } from '../domain/exercise-numbering.js';
const media = (text: string) => ({ text, media: [] });
const types: Record<string, string> = { fill_blank: 'SHORT_ANSWER', group: 'SHORT_ANSWER' };
/** Reference projection accepts only complete, current scoring data. */
export function questionBankExport(book: Book) {
  const readiness = scoringReadiness(book.document);
  if (readiness.missing)
    fail(422, `还有 ${readiness.missing} 道题的得分点缺失或已失效，请先补全评分细则再导出`);
  const document = structuredClone(book.document);
  numberComprehensiveExercises(document);
  const identities = exportIdentities(document);
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
      defaultScore: q.grading!.defaultScore,
      rubric: q.grading!.rubric,
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
      children: q.children.map((c, i) => {
        const { nodeType, ...child } = leaf(
          c,
          `${id}_${i + 1}`,
          chapterId,
          `${title} 第${i + 1}小题`,
        );
        return { ...child, orderNo: i + 1 };
      }),
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
    chapters: identities.chapters,
    questions: document.contents
      .filter((c) => c.question)
      .map((c) => {
        const section = document.sections.find((s) => s.id === c.sectionId);
        const identity = identities.questions.get(c.id)!;
        return question(
          c.question!,
          identity.id,
          identity.chapterId,
          `${section?.title ?? book.title} 第${identity.number}题`,
        );
      }),
  };
}
