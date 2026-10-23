import type { ValidationIssue } from './validation-issue.js';

/** ValidationReport contract. */
export type ValidationReport = {
  valid: boolean;
  issues: ValidationIssue[];
};
