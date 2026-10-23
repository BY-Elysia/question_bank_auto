import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { ProjectsService } from '../application/projects.service.interface.js';
import type {
  ListProjectsInput,
  ListProjectsResult,
} from '../application/commands/list-projects.command.js';
import type {
  CreateProjectInput,
  CreateProjectResult,
} from '../application/commands/create-project.command.js';
import type {
  GetProjectInput,
  GetProjectResult,
} from '../application/commands/get-project.command.js';
import type {
  UpdateProjectInput,
  UpdateProjectResult,
} from '../application/commands/update-project.command.js';
import type {
  DeleteProjectInput,
  DeleteProjectResult,
} from '../application/commands/delete-project.command.js';

@Injectable()
export class ProjectsUnimplementedService implements ProjectsService {
  async listProjects(_input: ListProjectsInput): Promise<ListProjectsResult> {
    throw new OperationNotImplemented('listProjects');
  }

  async createProject(_input: CreateProjectInput): Promise<CreateProjectResult> {
    throw new OperationNotImplemented('createProject');
  }

  async getProject(_input: GetProjectInput): Promise<GetProjectResult> {
    throw new OperationNotImplemented('getProject');
  }

  async updateProject(_input: UpdateProjectInput): Promise<UpdateProjectResult> {
    throw new OperationNotImplemented('updateProject');
  }

  async deleteProject(_input: DeleteProjectInput): Promise<DeleteProjectResult> {
    throw new OperationNotImplemented('deleteProject');
  }
}
