import type { DetectedStructure } from './detected-structure.js';
import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** StructureDetectOutput contract. */
export type StructureDetectOutput = {
  /** @enum {string} */
  kind: 'document-structure-detect';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  result: DetectedStructure | null;
  issues: SkillIssue[];
} & (unknown & {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'document-structure-detect';
});
