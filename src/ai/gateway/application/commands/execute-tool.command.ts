import type { ToolExecutionRequest } from '../dto/tool-execution-request.js';
import type { ToolResult } from '../../../runtime/contracts/tool-result.js';

/** 执行当前 Skill 获授权的工具调用. Runtime validation is not implemented yet. */
export interface ExecuteToolInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: ToolExecutionRequest;
}

export type ExecuteToolResult = ToolResult;
