import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { WorkspacesService } from '../application/workspaces.service.interface.js';
import type {
  GetWorkspaceInput,
  GetWorkspaceResult,
} from '../application/commands/get-workspace.command.js';
import type {
  SetWorkspaceRuntimeInput,
  SetWorkspaceRuntimeResult,
} from '../application/commands/set-workspace-runtime.command.js';
import type {
  GetWorkspaceRuntimeInput,
  GetWorkspaceRuntimeResult,
} from '../application/commands/get-workspace-runtime.command.js';

@Injectable()
export class WorkspacesUnimplementedService implements WorkspacesService {
  async getWorkspace(_input: GetWorkspaceInput): Promise<GetWorkspaceResult> {
    throw new OperationNotImplemented('getWorkspace');
  }

  async setWorkspaceRuntime(_input: SetWorkspaceRuntimeInput): Promise<SetWorkspaceRuntimeResult> {
    throw new OperationNotImplemented('setWorkspaceRuntime');
  }

  async getWorkspaceRuntime(_input: GetWorkspaceRuntimeInput): Promise<GetWorkspaceRuntimeResult> {
    throw new OperationNotImplemented('getWorkspaceRuntime');
  }
}
