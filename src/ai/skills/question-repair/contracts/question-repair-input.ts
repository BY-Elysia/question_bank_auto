import type { Question } from '../../../../modules/documents/domain/question.js';

/** QuestionRepairInput contract. */
export type QuestionRepairInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-repair';
  question: Question;
  sourceAssetIds: string[];
  instruction: string;
  allowedFields: (
    'prompt' | 'answer' | 'options' | 'title' | 'score' | 'rubric' | 'stem' | 'children'
  )[];
};
