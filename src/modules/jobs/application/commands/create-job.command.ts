import type { Job } from '../../domain/job.js';
import type { JobCreate } from '../dto/job-create.js';

/** 提交后台工作流. Runtime validation is not implemented yet. */
export interface CreateJobInput {
  path: {
    projectId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: JobCreate;
}

export type CreateJobResult = Job;
