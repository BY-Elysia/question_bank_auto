import type { ExtractedQuestions } from './extracted-questions.js';
import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** QuestionExtractOutput contract. */
export type QuestionExtractOutput = {
  /** @enum {string} */
  kind: 'question-extract';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  result: ExtractedQuestions | null;
  issues: SkillIssue[];
} & (unknown & {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-extract';
});
