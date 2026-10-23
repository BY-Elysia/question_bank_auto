import type { DocumentContent } from './document-content.js';

/** DocumentRevision contract. */
export type DocumentRevision = {
  /** Format: uuid */
  documentId: string;
  revision: number;
  content: DocumentContent;
  /** Format: date-time */
  createdAt: string;
  /** @enum {string} */
  origin: 'create' | 'manual' | 'proposal' | 'import' | 'restore';
  sourceJobId: string | null;
};
