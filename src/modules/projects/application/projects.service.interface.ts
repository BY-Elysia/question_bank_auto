import type { ListProjectsInput, ListProjectsResult } from './commands/list-projects.command.js';
import type { CreateProjectInput, CreateProjectResult } from './commands/create-project.command.js';
import type { GetProjectInput, GetProjectResult } from './commands/get-project.command.js';
import type { UpdateProjectInput, UpdateProjectResult } from './commands/update-project.command.js';
import type { DeleteProjectInput, DeleteProjectResult } from './commands/delete-project.command.js';

export const PROJECTS_SERVICE = Symbol('PROJECTS_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface ProjectsService {
  listProjects(input: ListProjectsInput): Promise<ListProjectsResult>;
  createProject(input: CreateProjectInput): Promise<CreateProjectResult>;
  getProject(input: GetProjectInput): Promise<GetProjectResult>;
  updateProject(input: UpdateProjectInput): Promise<UpdateProjectResult>;
  deleteProject(input: DeleteProjectInput): Promise<DeleteProjectResult>;
}
