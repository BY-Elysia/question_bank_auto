import { Module } from '@nestjs/common';
import { ProjectsController } from './presentation/projects.controller.js';
import { PROJECTS_SERVICE } from './application/projects.service.interface.js';
import { ProjectsUnimplementedService } from './infrastructure/projects.unimplemented.service.js';

@Module({
  controllers: [ProjectsController],
  providers: [{ provide: PROJECTS_SERVICE, useClass: ProjectsUnimplementedService }],
  exports: [PROJECTS_SERVICE],
})
export class ProjectsModule {}
