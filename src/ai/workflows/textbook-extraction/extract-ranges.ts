import { StructuredOutputError, type Skills, type SkillContext } from '../../ports/skills.js';
import { ExtractResult, type Range } from './contracts.js';

/** Retry malformed batches one complete range at a time; never split a cross-page question. */
export async function extractRanges(
  skills: Skills,
  input: { ranges: Range[]; excludedPending: Range[]; answerMode: string; feedback: string },
  pages: number[],
  context: SkillContext,
) {
  try {
    return await skills.run('page-content-extract', input, ExtractResult, pages, context);
  } catch (error) {
    if (!(error instanceof StructuredOutputError) || input.ranges.length < 2) throw error;
    const result: ReturnType<typeof ExtractResult.parse> = { items: [], issues: [] };
    for (const range of input.ranges) {
      context.signal.throwIfAborted();
      const part = await skills.run(
        'page-content-extract',
        { ...input, ranges: [range] },
        ExtractResult,
        [...new Set(range.sources.map((s) => s.page))],
        context,
      );
      // Even a valid JSON response must not introduce a sibling or pending range.
      if (part.items.length !== 1 || part.items[0]!.key !== range.key)
        throw new Error('Single-range extraction returned an unexpected range');
      result.items.push(...part.items);
      result.issues.push(...part.issues);
    }
    return result;
  }
}
