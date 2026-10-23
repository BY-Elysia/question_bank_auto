import type { Project } from '../../domain/project.js';
import type { ProjectUpdate } from '../dto/project-update.js';

/** 更新项目名称或归档状态. Runtime validation is not implemented yet. */
export interface UpdateProjectInput {
  path: {
    projectId: string;
  };
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
  body: ProjectUpdate;
}

export type UpdateProjectResult = Project;
