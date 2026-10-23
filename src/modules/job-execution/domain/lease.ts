import type { Checkpoint } from './checkpoint.js';
import type { Job } from '../../jobs/domain/job.js';
import type { WorkerContext } from './worker-context.js';

/** 仅能领取 token 所绑定 workspace 的 queued 任务；每次重新领取 fencingToken 递增。 */
export type Lease = {
  /** Format: uuid */
  leaseId: string;
  fencingToken: number;
  /** Format: date-time */
  expiresAt: string;
  heartbeatIntervalSeconds: number;
  job: Job;
  checkpoint: Checkpoint | null;
  context: WorkerContext;
};
