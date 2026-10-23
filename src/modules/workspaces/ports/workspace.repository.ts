import type { Workspace } from '../domain/workspace.js';
import type { WorkspaceRuntime } from '../domain/workspace-runtime.js';

export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

export interface WorkspaceRepository {
  findByOwner(userId: string): Promise<Workspace | null>;
  setDesiredState(
    userId: string,
    expectedGeneration: number,
    desiredState: 'running' | 'stopped',
  ): Promise<WorkspaceRuntime>;
}
