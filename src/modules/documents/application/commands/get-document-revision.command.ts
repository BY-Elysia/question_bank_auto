import type { DocumentRevision } from '../../domain/document-revision.js';

/** 读取不可变历史版本. Runtime validation is not implemented yet. */
export interface GetDocumentRevisionInput {
  path: {
    documentId: string;
    revision: number;
  };
}

export type GetDocumentRevisionResult = DocumentRevision;
