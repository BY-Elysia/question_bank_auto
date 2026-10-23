import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** QuestionTypeOutput contract. */
export type QuestionTypeOutput = {
  /** @enum {string} */
  kind: 'question-type-classify';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  suggestedType:
    | (
        | 'single_choice'
        | 'multiple_choice'
        | 'fill_blank'
        | 'short_answer'
        | 'proof'
        | 'calculation'
        | 'code'
        | 'other'
        | 'group'
      )
    | null;
  reason: string;
  issues: SkillIssue[];
} & (unknown & {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-type-classify';
});
