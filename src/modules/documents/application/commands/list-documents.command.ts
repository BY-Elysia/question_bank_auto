import type { DocumentPage } from '../dto/document-page.js';

/** 列出项目文档. Runtime validation is not implemented yet. */
export interface ListDocumentsInput {
  path: {
    projectId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListDocumentsResult = DocumentPage;
