import type { Job } from '../../domain/job.js';

/** 获取任务状态与结果. Runtime validation is not implemented yet. */
export interface GetJobInput {
  path: {
    jobId: string;
  };
}

export type GetJobResult = Job;
