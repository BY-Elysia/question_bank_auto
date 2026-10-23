import type { BoundaryResult } from './boundary-result.js';
import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** BoundaryDetectOutput contract. */
export type BoundaryDetectOutput = {
  /** @enum {string} */
  kind: 'question-boundary-detect';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  result: BoundaryResult | null;
  issues: SkillIssue[];
} & (unknown & {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-boundary-detect';
});
