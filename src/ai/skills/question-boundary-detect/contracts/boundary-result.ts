import type { QuestionRange } from './question-range.js';

/** BoundaryResult contract. */
export type BoundaryResult = {
  completeRanges: QuestionRange[];
  pendingRanges: QuestionRange[];
  continuesPrevious: boolean;
};
