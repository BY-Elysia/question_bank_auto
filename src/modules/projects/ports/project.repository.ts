import type { UserScope } from '../../../shared/contracts/identity-context.js';
import type { Project } from '../domain/project.js';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

export interface ProjectRepository {
  find(scope: UserScope, projectId: string): Promise<Project | null>;
  save(scope: UserScope, project: Project, expectedRevision: number): Promise<Project>;
  markDeleted(scope: UserScope, projectId: string, expectedRevision: number): Promise<void>;
}
