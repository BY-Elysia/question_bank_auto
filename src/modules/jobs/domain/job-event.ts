import type { JobProgress } from './job-progress.js';
import type { JobState } from './job-state.js';

/** 每个任务递增的事件 ID；SSE event 字段等于 type，id 等于 id，data 是此对象。终态为 succeeded/failed/cancelled/needs_input。 */
export type JobEvent = {
  id: string;
  /** Format: uuid */
  jobId: string;
  /** @enum {string} */
  type: 'job.state' | 'job.progress' | 'step.completed' | 'proposal.created' | 'job.finished';
  /** Format: date-time */
  occurredAt: string;
  state: JobState;
  progress?: JobProgress;
  /** Format: uuid */
  stepId?: string;
  /** Format: uuid */
  proposalId?: string;
};
