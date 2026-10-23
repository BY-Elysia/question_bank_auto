import type { QuestionRange } from './question-range.js';

/** BoundaryDetectInput contract. */
export type BoundaryDetectInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-boundary-detect';
  /** Format: uuid */
  currentPageAssetId: string;
  pendingPageAssetIds: string[];
  lookaheadPageAssetId: string | null;
  currentNodeId: string | null;
  previousPendingRanges: QuestionRange[];
};
