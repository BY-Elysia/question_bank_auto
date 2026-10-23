/** 软删除项目. Runtime validation is not implemented yet. */
export interface DeleteProjectInput {
  path: {
    projectId: string;
  };
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
}

export type DeleteProjectResult = void;
