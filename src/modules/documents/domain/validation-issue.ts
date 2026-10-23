import type { SourceEvidence } from '../../assets/domain/source-evidence.js';

/** ValidationIssue contract. */
export type ValidationIssue = {
  /** @enum {string} */
  severity: 'error' | 'warning';
  code: string;
  pointer: string;
  message: string;
  evidence: SourceEvidence[];
};
