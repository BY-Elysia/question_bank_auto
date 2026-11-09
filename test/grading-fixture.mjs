import { gradingBasis, scoringTargets } from '../dist/app/modules/textbooks/domain/grading.js';
/** Deterministic scoring fixture for tests unrelated to model generation. */
export function withGrading(book) {
  for (const t of scoringTargets(book.document))
    t.leaf.grading = {
      defaultScore: 10,
      basis: gradingBasis(t.leaf, t.sharedPrompt),
      rubric: [
        { rubricItemKey: 'key_1', maxScore: 10, criteria: '使用本题给定条件完成计算并写出结论' },
      ],
    };
  return book;
}
