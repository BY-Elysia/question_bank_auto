/** LibrarySearchInput contract. */
export type LibrarySearchInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-bank-search';
  query: string;
  sourceIds: string[];
  limit: number;
};
