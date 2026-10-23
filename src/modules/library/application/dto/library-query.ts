/** LibraryQuery contract. */
export type LibraryQuery = {
  query?: string;
  publicationIds?: string[];
  nodeIds?: string[];
  /** @enum {string} */
  kind?: 'choice' | 'free_response' | 'group';
  cursor?: string;
  limit?: number;
};
