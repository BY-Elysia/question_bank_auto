import type { Question } from '../../../../modules/documents/domain/question.js';

/** QuestionTypeInput contract. */
export type QuestionTypeInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-type-classify';
  question: Question;
  allowedTypes: (
    | 'single_choice'
    | 'multiple_choice'
    | 'fill_blank'
    | 'short_answer'
    | 'proof'
    | 'calculation'
    | 'code'
    | 'other'
    | 'group'
  )[];
};
