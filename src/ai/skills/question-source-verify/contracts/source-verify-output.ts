import type { Question } from '../../../../modules/documents/domain/question.js';
import type { ValidationIssue } from '../../../../modules/documents/domain/validation-issue.js';

/** SourceVerifyOutput contract. */
export type SourceVerifyOutput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-source-verify';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  issues: ValidationIssue[];
  suggestedQuestion: Question | null;
};
