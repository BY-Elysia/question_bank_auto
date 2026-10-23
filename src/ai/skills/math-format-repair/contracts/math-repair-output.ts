import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** MathRepairOutput contract. */
export type MathRepairOutput = {
  /** @enum {string} */
  kind: 'math-format-repair';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  text: string | null;
  explanation: string;
  issues: SkillIssue[];
} & (unknown & {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'math-format-repair';
});
