import type { JobProgress } from '../../../jobs/domain/job-progress.js';
import type { LeaseContext } from '../../domain/lease-context.js';

/** Heartbeat contract. */
export type Heartbeat = {
  lease: LeaseContext;
  progress: JobProgress;
};
