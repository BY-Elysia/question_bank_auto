import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { RegistryService } from '../application/registry.service.interface.js';
import type {
  ListSkillsInput,
  ListSkillsResult,
} from '../application/commands/list-skills.command.js';
import type {
  ListToolsInput,
  ListToolsResult,
} from '../application/commands/list-tools.command.js';
import type {
  ListWorkflowsInput,
  ListWorkflowsResult,
} from '../application/commands/list-workflows.command.js';

@Injectable()
export class RegistryUnimplementedService implements RegistryService {
  async listSkills(_input: ListSkillsInput): Promise<ListSkillsResult> {
    throw new OperationNotImplemented('listSkills');
  }

  async listTools(_input: ListToolsInput): Promise<ListToolsResult> {
    throw new OperationNotImplemented('listTools');
  }

  async listWorkflows(_input: ListWorkflowsInput): Promise<ListWorkflowsResult> {
    throw new OperationNotImplemented('listWorkflows');
  }
}
