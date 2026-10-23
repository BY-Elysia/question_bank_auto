import type { InvocationPage } from '../dto/invocation-page.js';

/** 查询任务模型调用用量. Runtime validation is not implemented yet. */
export interface ListJobInvocationsInput {
  path: {
    jobId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListJobInvocationsResult = InvocationPage;
