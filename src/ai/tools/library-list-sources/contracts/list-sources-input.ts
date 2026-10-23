/** ListSourcesInput contract. */
export type ListSourcesInput = {
  /** @enum {string} */
  kind?: 'textbook' | 'exam';
  cursor?: string;
  limit?: number;
};
