import type { RevisionPage } from '../dto/revision-page.js';

/** 列出文档历史快照. Runtime validation is not implemented yet. */
export interface ListDocumentRevisionsInput {
  path: {
    documentId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListDocumentRevisionsResult = RevisionPage;
