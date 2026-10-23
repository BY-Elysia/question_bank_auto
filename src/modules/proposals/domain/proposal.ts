import type { DocumentChange } from './document-change.js';
import type { ValidationReport } from '../../documents/domain/validation-report.js';

/** Proposal contract. */
export type Proposal = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  projectId: string;
  /** Format: uuid */
  documentId: string;
  baseRevision: number;
  /** Format: uuid */
  jobId: string;
  /** @enum {string} */
  status: 'pending' | 'applied' | 'rejected';
  changes: DocumentChange[];
  validation: ValidationReport;
  /** Format: date-time */
  createdAt: string;
  appliedRevision: number | null;
};
