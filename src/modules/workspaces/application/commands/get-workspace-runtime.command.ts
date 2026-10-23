import type { WorkspaceRuntime } from '../../domain/workspace-runtime.js';

/** 查询容器实际状态. Runtime validation is not implemented yet. */
export interface GetWorkspaceRuntimeInput {}

export type GetWorkspaceRuntimeResult = WorkspaceRuntime;
