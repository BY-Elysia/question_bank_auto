import type { Job } from '../../domain/job.js';
import type { JobRetry } from '../dto/job-retry.js';

/** 从失败或取消任务创建重试任务. Runtime validation is not implemented yet. */
export interface RetryJobInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: JobRetry;
}

export type RetryJobResult = Job;
