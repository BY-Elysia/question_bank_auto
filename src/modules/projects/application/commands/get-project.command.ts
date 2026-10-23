import type { Project } from '../../domain/project.js';

/** 获取项目. Runtime validation is not implemented yet. */
export interface GetProjectInput {
  path: {
    projectId: string;
  };
}

export type GetProjectResult = Project;
