import type { Question } from '../../../../modules/documents/domain/question.js';

/** SourceVerifyInput contract. */
export type SourceVerifyInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-source-verify';
  question: Question;
  sourceAssetIds: string[];
};
