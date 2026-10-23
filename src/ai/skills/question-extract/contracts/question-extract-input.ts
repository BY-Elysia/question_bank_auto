import type { QuestionRange } from '../../question-boundary-detect/contracts/question-range.js';

/** QuestionExtractInput contract. */
export type QuestionExtractInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-extract';
  /** @enum {string} */
  documentKind: 'textbook' | 'exam';
  /** Format: uuid */
  nodeId: string;
  ranges: QuestionRange[];
  /** @enum {string} */
  answerMode: 'extract_visible' | 'leave_empty';
};
