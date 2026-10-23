import type { JobPage } from '../dto/job-page.js';

/** 列出项目任务. Runtime validation is not implemented yet. */
export interface ListJobsInput {
  path: {
    projectId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListJobsResult = JobPage;
