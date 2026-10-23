import type { LibrarySearchInput } from '../../../skills/question-bank-search/contracts/library-search-input.js';

/** LibrarySearchRequest contract. */
export type LibrarySearchRequest = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'library-search';
  input: LibrarySearchInput;
};
