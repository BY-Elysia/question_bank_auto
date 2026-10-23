import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PROJECTS_SERVICE } from '../application/projects.service.interface.js';
import type { ProjectsService } from '../application/projects.service.interface.js';
import type { ListProjectsInput, ListProjectsResult } from './dto/list-projects.dto.js';
import type { CreateProjectInput, CreateProjectResult } from './dto/create-project.dto.js';
import type { GetProjectInput, GetProjectResult } from './dto/get-project.dto.js';
import type { UpdateProjectInput, UpdateProjectResult } from './dto/update-project.dto.js';
import type { DeleteProjectInput, DeleteProjectResult } from './dto/delete-project.dto.js';

@Controller()
export class ProjectsController {
  constructor(@Inject(PROJECTS_SERVICE) private readonly service: ProjectsService) {}

  /** 列出项目 */
  @Get('api/v1/projects')
  @HttpCode(200)
  listProjects(@Query() query: ListProjectsInput['query']): Promise<ListProjectsResult> {
    return this.service.listProjects({ query });
  }

  /** 创建教材或试卷项目 */
  @Post('api/v1/projects')
  @HttpCode(201)
  createProject(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateProjectInput['body'],
  ): Promise<CreateProjectResult> {
    return this.service.createProject({ headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 获取项目 */
  @Get('api/v1/projects/:projectId')
  @HttpCode(200)
  getProject(@Param() path: GetProjectInput['path']): Promise<GetProjectResult> {
    return this.service.getProject({ path });
  }

  /** 更新项目名称或归档状态 */
  @Patch('api/v1/projects/:projectId')
  @HttpCode(200)
  updateProject(
    @Param() path: UpdateProjectInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: UpdateProjectInput['body'],
  ): Promise<UpdateProjectResult> {
    return this.service.updateProject({
      path,
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
      body,
    });
  }

  /** 软删除项目 */
  @Delete('api/v1/projects/:projectId')
  @HttpCode(204)
  deleteProject(
    @Param() path: DeleteProjectInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
  ): Promise<DeleteProjectResult> {
    return this.service.deleteProject({
      path,
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
    });
  }
}
