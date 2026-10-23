import type { ProjectPage } from '../dto/project-page.js';

/** 列出项目. Runtime validation is not implemented yet. */
export interface ListProjectsInput {
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListProjectsResult = ProjectPage;
