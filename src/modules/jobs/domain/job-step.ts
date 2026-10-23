import type { SkillId } from '../../../ai/runtime/contracts/skill-id.js';
import type { ValidationIssue } from '../../documents/domain/validation-issue.js';

/** JobStep contract. */
export type JobStep = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  jobId: string;
  sequence: number;
  skillId: SkillId | null;
  /** @enum {string} */
  state: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'needs_input';
  attempt: number;
  inputAssetIds: string[];
  outputAssetIds: string[];
  invocationIds: string[];
  issues: ValidationIssue[];
};
