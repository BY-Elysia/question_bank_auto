/** ProjectCreate contract. */
export type ProjectCreate = {
  name: string;
  /** @enum {string} */
  kind: 'textbook' | 'exam';
  description?: string;
};
