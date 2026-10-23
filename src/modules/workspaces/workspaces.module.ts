import { Module } from '@nestjs/common';
import { WorkspacesController } from './presentation/workspaces.controller.js';
import { WORKSPACES_SERVICE } from './application/workspaces.service.interface.js';
import { WorkspacesUnimplementedService } from './infrastructure/workspaces.unimplemented.service.js';

@Module({
  controllers: [WorkspacesController],
  providers: [{ provide: WORKSPACES_SERVICE, useClass: WorkspacesUnimplementedService }],
  exports: [WORKSPACES_SERVICE],
})
export class WorkspacesModule {}
