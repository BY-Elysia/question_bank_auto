import {
  transcriptionProblems,
  transcriptionIssues,
} from '../../../modules/textbooks/domain/transcription-quality.js';
import { materialize } from './guards.js';
import { StructuredOutputError, type Skills, type SkillContext } from '../../ports/skills.js';
import { ExtractResult, type Range } from './contracts.js';
type Input = { ranges: Range[]; excludedPending: Range[]; answerMode: string; feedback: string };
type Result = ReturnType<typeof ExtractResult.parse>;

/** Keep every question whole, while bounding ordinary-text batches. */
function batches(ranges: Range[]): Range[][] {
  const result: Range[][] = [];
  let text: Range[] = [];
  const flush = () => {
    if (text.length) result.push(text);
    text = [];
  };
  for (const range of ranges) {
    if (['question', 'example', 'answer'].includes(range.kind)) {
      flush();
      result.push([range]);
    } else {
      text.push(range);
      if (text.length === 4) flush();
    }
  }
  flush();
  return result;
}
export async function extractRanges(
  skills: Skills,
  input: Input,
  pages: number[],
  context: SkillContext,
) {
  const result: Result = { items: [], issues: [] };
  async function extract(ranges: Range[]): Promise<Result> {
    context.signal.throwIfAborted();
    const sourcePages = [...new Set(ranges.flatMap((r) => r.sources.map((s) => s.page)))];
    if (sourcePages.some((page) => !pages.includes(page)))
      throw new Error('Range outside formal queue');
    try {
      let feedback = input.feedback;
      for (let attempt = 0; attempt < 3; attempt++) {
        const part = await skills.run(
          'page-content-extract',
          { ...input, ranges, feedback },
          ExtractResult,
          sourcePages,
          context,
        );
        try {
          if (
            part.items.length !== ranges.length ||
            new Set(part.items.map((i) => i.key)).size !== ranges.length ||
            part.items.some((i) => !ranges.some((r) => r.key === i.key))
          )
            throw new Error('Extraction returned an unexpected range');
          const checked = materialize(part, ranges);
          const defects = checked.flatMap(transcriptionProblems);
          if (defects.length) throw new Error(defects.join('; '));
          part.issues.push(...transcriptionIssues(checked));
          if (part.items.some((i) => i.content.question && i.content.text.trim()))
            throw new Error(
              'Question content.text must be empty; keep all source text in question fields without duplication',
            );
          return part;
        } catch (error) {
          feedback = `${String(error)}. Return each requested key exactly once: ${ranges.map((r) => r.key).join(', ')}; preserve all subquestions and source derivations.`;
        }
      }
      throw new Error(`Extraction blocked after three semantic attempts: ${feedback}`);
    } catch (error) {
      if (!(error instanceof StructuredOutputError) || ranges.length < 2) throw error;
      const parts: Result = { items: [], issues: [] };
      for (const range of ranges) {
        const part = await extract([range]);
        parts.items.push(...part.items);
        parts.issues.push(...part.issues);
      }
      return parts;
    }
  }
  // Return only after every batch succeeds; the workflow advances its checkpoint atomically.
  for (const ranges of batches(input.ranges)) {
    const part = await extract(ranges);
    result.items.push(...part.items);
    result.issues.push(...part.issues);
  }
  return result;
}
