/** DocumentSummary contract. */
export type DocumentSummary = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  projectId: string;
  revision: number;
  /** @enum {string} */
  kind: 'textbook' | 'exam';
  title: string;
  questionCount: number;
  /** Format: date-time */
  updatedAt: string;
};
