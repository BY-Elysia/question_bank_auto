import type { Job } from '../../domain/job.js';

/** 请求合作式取消任务. Runtime validation is not implemented yet. */
export interface CancelJobInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
}

export type CancelJobResult = Job;
