import type { DocumentChange } from './document-change.js';

/** ProposalDraft contract. */
export type ProposalDraft = {
  /** Format: uuid */
  documentId: string;
  baseRevision: number;
  changes: DocumentChange[];
};
