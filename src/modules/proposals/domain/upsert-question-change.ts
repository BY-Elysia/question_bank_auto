import type { Question } from '../../documents/domain/question.js';

/** UpsertQuestionChange contract. */
export type UpsertQuestionChange = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'upsert_question';
  question: Question;
};
