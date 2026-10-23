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
import { REGISTRY_SERVICE } from '../application/registry.service.interface.js';
import type { RegistryService } from '../application/registry.service.interface.js';
import type { ListSkillsInput, ListSkillsResult } from './dto/list-skills.dto.js';
import type { ListToolsInput, ListToolsResult } from './dto/list-tools.dto.js';
import type { ListWorkflowsInput, ListWorkflowsResult } from './dto/list-workflows.dto.js';

@Controller()
export class RegistryController {
  constructor(@Inject(REGISTRY_SERVICE) private readonly service: RegistryService) {}

  /** 列出核心 Skill 定义 */
  @Get('api/v1/ai/skills')
  @HttpCode(200)
  listSkills(): Promise<ListSkillsResult> {
    return this.service.listSkills({});
  }

  /** 列出可用 Tool 定义 */
  @Get('api/v1/ai/tools')
  @HttpCode(200)
  listTools(): Promise<ListToolsResult> {
    return this.service.listTools({});
  }

  /** 列出工作流定义 */
  @Get('api/v1/ai/workflows')
  @HttpCode(200)
  listWorkflows(): Promise<ListWorkflowsResult> {
    return this.service.listWorkflows({});
  }
}
