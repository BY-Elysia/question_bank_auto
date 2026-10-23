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
import { WORKSPACES_SERVICE } from '../application/workspaces.service.interface.js';
import type { WorkspacesService } from '../application/workspaces.service.interface.js';
import type { GetWorkspaceInput, GetWorkspaceResult } from './dto/get-workspace.dto.js';
import type {
  SetWorkspaceRuntimeInput,
  SetWorkspaceRuntimeResult,
} from './dto/set-workspace-runtime.dto.js';
import type {
  GetWorkspaceRuntimeInput,
  GetWorkspaceRuntimeResult,
} from './dto/get-workspace-runtime.dto.js';

@Controller()
export class WorkspacesController {
  constructor(@Inject(WORKSPACES_SERVICE) private readonly service: WorkspacesService) {}

  /** 获取用户唯一工作区 */
  @Get('api/v1/me/workspace')
  @HttpCode(200)
  getWorkspace(): Promise<GetWorkspaceResult> {
    return this.service.getWorkspace({});
  }

  /** 设置容器运行目标状态 */
  @Put('api/v1/me/workspace/runtime')
  @HttpCode(202)
  setWorkspaceRuntime(
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: SetWorkspaceRuntimeInput['body'],
  ): Promise<SetWorkspaceRuntimeResult> {
    return this.service.setWorkspaceRuntime({
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
      body,
    });
  }

  /** 查询容器实际状态 */
  @Get('api/v1/me/workspace/runtime')
  @HttpCode(200)
  getWorkspaceRuntime(): Promise<GetWorkspaceRuntimeResult> {
    return this.service.getWorkspaceRuntime({});
  }
}
