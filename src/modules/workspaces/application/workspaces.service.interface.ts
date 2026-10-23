import type { GetWorkspaceInput, GetWorkspaceResult } from './commands/get-workspace.command.js';
import type {
  SetWorkspaceRuntimeInput,
  SetWorkspaceRuntimeResult,
} from './commands/set-workspace-runtime.command.js';
import type {
  GetWorkspaceRuntimeInput,
  GetWorkspaceRuntimeResult,
} from './commands/get-workspace-runtime.command.js';

export const WORKSPACES_SERVICE = Symbol('WORKSPACES_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface WorkspacesService {
  getWorkspace(input: GetWorkspaceInput): Promise<GetWorkspaceResult>;
  setWorkspaceRuntime(input: SetWorkspaceRuntimeInput): Promise<SetWorkspaceRuntimeResult>;
  getWorkspaceRuntime(input: GetWorkspaceRuntimeInput): Promise<GetWorkspaceRuntimeResult>;
}
