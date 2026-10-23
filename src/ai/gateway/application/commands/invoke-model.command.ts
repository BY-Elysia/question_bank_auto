import type { ModelInvocationRequest } from '../dto/model-invocation-request.js';
import type { ModelInvocationResponse } from '../dto/model-invocation-response.js';

/** 通过冻结配置调用外部模型. Runtime validation is not implemented yet. */
export interface InvokeModelInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: ModelInvocationRequest;
}

export type InvokeModelResult = ModelInvocationResponse;
