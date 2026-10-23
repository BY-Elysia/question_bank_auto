import type { Workspace } from '../../domain/workspace.js';

/** 获取用户唯一工作区. Runtime validation is not implemented yet. */
export interface GetWorkspaceInput {}

export type GetWorkspaceResult = Workspace;
