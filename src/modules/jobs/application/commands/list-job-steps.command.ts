import type { StepPage } from '../dto/step-page.js';

/** 获取处理步骤. Runtime validation is not implemented yet. */
export interface ListJobStepsInput {
  path: {
    jobId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListJobStepsResult = StepPage;
