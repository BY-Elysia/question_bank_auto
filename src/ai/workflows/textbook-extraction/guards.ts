import type { z } from 'zod';
import { BoundaryResult, ExtractResult, type Range } from './contracts.js';
import type { Document, Content } from '../../../modules/textbooks/domain/content.js';
import { contentProblems } from '../../../modules/textbooks/domain/validation.js';
export function checkBoundary(
  result: z.infer<typeof BoundaryResult>,
  queue: number[],
  pending: Range[],
  document: Document,
) {
  const ranges = [...result.complete, ...result.pending];
  const keys = new Set<string>();
  for (const range of ranges) {
    if (keys.has(range.key) || document.contents.some((c) => c.key === range.key))
      throw new Error(`Duplicate/already committed range ${range.key}`);
    keys.add(range.key);
    if (range.sources.some((s) => !queue.includes(s.page)))
      throw new Error('Lookahead page must not enter formal extraction ranges');
    if (range.sectionId && !document.sections.some((s) => s.id === range.sectionId))
      throw new Error('Unknown section');
  }
  for (const previous of pending) {
    const next = ranges.find((range) => range.key === previous.key);
    if (
      !next ||
      previous.sources.some((source) => !next.sources.some((s) => s.page === source.page))
    )
      throw new Error(`Pending range was lost: ${previous.key}`);
  }
  if (
    result.blankPages.some(
      (page) =>
        !queue.includes(page) ||
        ranges.some((r) => r.sources.some((s) => s.page === page)) ||
        document.contents.some((c) => c.sources.some((s) => s.page === page)),
    )
  )
    throw new Error('Invalid blank page declaration');
  for (const page of queue)
    if (
      !result.blankPages.includes(page) &&
      !ranges.some((r) => r.sources.some((s) => s.page === page)) &&
      !document.contents.some((c) => c.sources.some((s) => s.page === page))
    )
      throw new Error(`Page ${page} has no content or blank declaration`);
}
export function materialize(result: z.infer<typeof ExtractResult>, ranges: Range[]): Content[] {
  if (
    result.items.length !== ranges.length ||
    new Set(result.items.map((i) => i.key)).size !== ranges.length
  )
    throw new Error('Boundary/extractor conflict: missing or duplicate content');
  return ranges.map((range) => {
    const item = result.items.find((i) => i.key === range.key);
    if (!item) throw new Error(`Boundary/extractor conflict: missing ${range.key}`);
    const content: Content = { ...item.content, ...range, id: `c_${range.key}` };
    // label belongs to the boundary contract, not the persisted content contract.
    delete (content as Content & { label?: string }).label;
    if (content.id.length > 100) throw new Error('Range key is too long');
    const problems = contentProblems(content);
    if (problems.length) throw new Error(problems.join('; '));
    const question = content.question;
    for (const q of question ? [question, ...question.children] : []) {
      if (q.answer?.sources.some((s) => !range.sources.some((r) => r.page === s.page)))
        throw new Error('Answer evidence is outside extraction range');
      if (q.answer && (q.answer.origin !== 'source' || q.answer.review !== 'pending'))
        throw new Error('Extraction can only return source answers pending review');
    }
    return content;
  });
}
export function readingOrder(
  a: { sources: { page: number; box: number[] }[] },
  b: { sources: { page: number; box: number[] }[] },
) {
  const x = a.sources[0]!,
    y = b.sources[0]!;
  return x.page - y.page || x.box[1]! - y.box[1]! || x.box[0]! - y.box[0]!;
}
