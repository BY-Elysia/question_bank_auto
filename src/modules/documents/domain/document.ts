import type { DocumentContent } from './document-content.js';

/** Document contract. */
export type Document = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  projectId: string;
  revision: number;
  content: DocumentContent;
  /** Format: date-time */
  createdAt: string;
  /** Format: date-time */
  updatedAt: string;
};
