import type { UserScope } from '../../../shared/contracts/identity-context.js';
import type { Job } from '../domain/job.js';
import type { JobEvent } from '../domain/job-event.js';

export const JOB_REPOSITORY = Symbol('JOB_REPOSITORY');

export interface JobRepository {
  find(scope: UserScope, jobId: string): Promise<Job | null>;
  /** Must atomically persist the job and its queue outbox event. */
  createWithOutbox(scope: UserScope, job: Job): Promise<void>;
  requestCancel(scope: UserScope, jobId: string): Promise<Job>;
  readEvents(
    scope: UserScope,
    jobId: string,
    afterId: string | null,
    limit: number,
  ): Promise<JobEvent[]>;
}
