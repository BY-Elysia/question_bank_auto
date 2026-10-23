import type { LibraryQuery } from '../../../../modules/library/application/dto/library-query.js';

/** LibrarySearchQuestionsCall contract. */
export type LibrarySearchQuestionsCall = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'library.search-questions';
  input: LibraryQuery;
};
