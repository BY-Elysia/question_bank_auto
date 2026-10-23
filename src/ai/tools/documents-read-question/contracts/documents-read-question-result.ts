import type { LibraryQuestion } from '../../../../modules/library/domain/library-question.js';

/** DocumentsReadQuestionResult contract. */
export type DocumentsReadQuestionResult = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'documents.read-question';
  output: LibraryQuestion;
};
