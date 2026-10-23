import type { QuestionPage } from '../../../../modules/library/application/dto/question-page.js';

/** LibrarySearchQuestionsResult contract. */
export type LibrarySearchQuestionsResult = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'library.search-questions';
  output: QuestionPage;
};
