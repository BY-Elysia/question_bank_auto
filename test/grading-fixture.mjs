import { gradingBasis, scoringTargets } from '../dist/app/modules/textbooks/domain/grading.js';
/** Deterministic scoring fixture for tests unrelated to model generation. */
export function withGrading(book) {
  for (const t of scoringTargets(book.document))
    t.leaf.grading = {
      defaultScore: 10,
      basis: gradingBasis(t.leaf, t.sharedPrompt),
      rubric: [
        { rubricItemKey: 'key_1', maxScore: 3, criteria: '根据本题已知条件写出计算表达式' },
        { rubricItemKey: 'key_2', maxScore: 4, criteria: '代入给定数据完成关键计算步骤' },
        { rubricItemKey: 'key_3', maxScore: 3, criteria: '写出本题计算结果并验证成立' },
      ],
    };
  return book;
}
