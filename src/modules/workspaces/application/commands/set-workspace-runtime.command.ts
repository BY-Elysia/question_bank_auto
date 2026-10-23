import type { RuntimeRequest } from '../dto/runtime-request.js';
import type { WorkspaceRuntime } from '../../domain/workspace-runtime.js';

/** 设置容器运行目标状态. Runtime validation is not implemented yet. */
export interface SetWorkspaceRuntimeInput {
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
  body: RuntimeRequest;
}

export type SetWorkspaceRuntimeResult = WorkspaceRuntime;
