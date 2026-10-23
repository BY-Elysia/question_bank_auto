import type { Question } from '../../../../modules/documents/domain/question.js';
import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** QuestionRepairOutput contract. */
export type QuestionRepairOutput = {
  /** @enum {string} */
  kind: 'question-repair';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  question: Question | null;
  changedFields: string[];
  issues: SkillIssue[];
} & (unknown & {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-repair';
});
