import { Module, type DynamicModule } from '@nestjs/common';
import {
  WorkspacesController,
  WORKSPACES,
  WORKSPACE_VIEW,
} from './presentation/workspaces.controller.js';
import type { WorkspacesService } from './application/workspaces.service.js';
import type { WorkspaceView } from './application/workspace-view.js';
@Module({})
export class WorkspacesModule {
  static register(workspaces: WorkspacesService, view: WorkspaceView): DynamicModule {
    return {
      module: WorkspacesModule,
      controllers: [WorkspacesController],
      providers: [
        { provide: WORKSPACES, useValue: workspaces },
        { provide: WORKSPACE_VIEW, useValue: view },
      ],
    };
  }
}
