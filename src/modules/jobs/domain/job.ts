import type { ExecutionPlan } from './execution-plan.js';
import type { JobProgress } from './job-progress.js';
import type { JobResult } from './job-result.js';
import type { JobState } from './job-state.js';
import type { Problem } from '../../../shared/errors/problem.js';
import type { Usage } from '../../model-config/domain/usage.js';
import type { WorkflowRequest } from '../../../ai/workflows/contracts/workflow-request.js';

/** Job contract. */
export type Job = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  projectId: string;
  /** Format: uuid */
  workspaceId: string;
  state: JobState;
  request: WorkflowRequest;
  plan: ExecutionPlan;
  progress: JobProgress;
  result: JobResult;
  usage: Usage;
  error: Problem | null;
  retryOfJobId: string | null;
  /** Format: date-time */
  createdAt: string;
  /** Format: date-time */
  updatedAt: string;
  finishedAt: string | null;
};
