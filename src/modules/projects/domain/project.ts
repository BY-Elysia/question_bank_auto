/** Project contract. */
export type Project = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  workspaceId: string;
  name: string;
  /** @enum {string} */
  kind: 'textbook' | 'exam';
  description: string;
  archived: boolean;
  revision: number;
  /** Format: date-time */
  createdAt: string;
  /** Format: date-time */
  updatedAt: string;
};
