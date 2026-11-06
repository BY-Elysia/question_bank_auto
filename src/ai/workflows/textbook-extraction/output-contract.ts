import { WireSource, coordinateInstructions, mapBoxes } from './spatial-contract.js';
import { z } from 'zod';
import { Answer, Leaf, Question, Issue } from '../../../modules/textbooks/domain/content.js';
import type { Range } from './contracts.js';
import type { OutputContract } from '../../ports/skills.js';
const WireAnswer = Answer.omit({ origin: true, review: true }).extend({
  sources: z.array(WireSource),
});
const WireLeaf = Leaf.extend({ answer: WireAnswer.nullable() });
const WireQuestion = Question.omit({ sourceLabel: true }).extend({
  answer: WireAnswer.nullable(),
  children: z.array(WireLeaf),
});
function sourceAnswer(answer: z.infer<typeof WireAnswer> | null) {
  return answer === null
    ? null
    : { ...(mapBoxes(answer, 'decode') as object), origin: 'source', review: 'pending' };
}
/** The workflow owns identity and fixed metadata; the model transcribes variable source fields only. */
export function extractionOutput(ranges: Range[]): OutputContract | undefined {
  if (ranges.length !== 1) return;
  const range = ranges[0]!;
  if (['question', 'example'].includes(range.kind)) {
    const schema = z.strictObject({ question: WireQuestion, issues: z.array(Issue) });
    return {
      schema,
      encode: (v) => mapBoxes(v, 'encode'),
      instructions:
        coordinateInstructions +
        '本次为单题契约：顶层只输出 question、issues。不要输出 items/content/key/text/table/caption；答案只写 text/explanation/sources，不写 origin/review，后端统一设置。',
      decode(value) {
        const wire = schema.parse(value),
          q = wire.question;
        return {
          items: [
            {
              key: range.key,
              content: {
                text: '',
                table: null,
                caption: null,
                question: {
                  ...q,
                  answer: sourceAnswer(q.answer),
                  children: q.children.map((c) => ({ ...c, answer: sourceAnswer(c.answer) })),
                },
              },
            },
          ],
          issues: wire.issues,
        };
      },
    };
  }
  if (['heading', 'paragraph', 'formula', 'answer'].includes(range.kind)) {
    const schema = z.strictObject({ text: z.string(), issues: z.array(Issue) });
    return {
      schema,
      encode: (v) => mapBoxes(v, 'encode'),
      instructions:
        coordinateInstructions +
        '本次为单个正文/标题契约：顶层只输出 text、issues。不要输出 items/content/key/question/table/caption。',
      decode(value) {
        const wire = schema.parse(value);
        return {
          items: [
            {
              key: range.key,
              content: { text: wire.text, question: null, table: null, caption: null },
            },
          ],
          issues: wire.issues,
        };
      },
    };
  }
}
