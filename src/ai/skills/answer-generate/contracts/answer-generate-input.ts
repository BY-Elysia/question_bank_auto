import type { Question } from '../../../../modules/documents/domain/question.js';

/** AnswerGenerateInput contract. */
export type AnswerGenerateInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'answer-generate';
  question: Question;
  subject: string;
  instruction?: string;
  includeRubric: boolean;
};
