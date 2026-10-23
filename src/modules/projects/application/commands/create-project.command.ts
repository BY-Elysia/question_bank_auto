import type { Project } from '../../domain/project.js';
import type { ProjectCreate } from '../dto/project-create.js';

/** 创建教材或试卷项目. Runtime validation is not implemented yet. */
export interface CreateProjectInput {
  headers: {
    'Idempotency-Key': string;
  };
  body: ProjectCreate;
}

export type CreateProjectResult = Project;
