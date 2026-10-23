import type { Document } from '../../domain/document.js';

/** 读取当前文档. Runtime validation is not implemented yet. */
export interface GetDocumentInput {
  path: {
    documentId: string;
  };
}

export type GetDocumentResult = Document;
