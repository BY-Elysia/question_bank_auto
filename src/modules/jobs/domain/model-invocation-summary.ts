import type { SkillId } from '../../../ai/runtime/contracts/skill-id.js';
import type { Usage } from '../../model-config/domain/usage.js';

/** ModelInvocationSummary contract. */
export type ModelInvocationSummary = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  jobId: string;
  /** Format: uuid */
  stepId: string;
  skillId: SkillId;
  providerId: string;
  modelId: string;
  profileRevision: number;
  /** @enum {string} */
  status: 'running' | 'succeeded' | 'failed' | 'unknown';
  usage: Usage;
  /** Format: date-time */
  startedAt: string;
  finishedAt: string | null;
};
