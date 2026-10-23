import type { Job } from '../../../jobs/domain/job.js';
import type { JobComplete } from '../dto/job-complete.js';

/** 提交任务终态及候选结果. Runtime validation is not implemented yet. */
export interface CompleteJobInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: JobComplete;
}

export type CompleteJobResult = Job;
