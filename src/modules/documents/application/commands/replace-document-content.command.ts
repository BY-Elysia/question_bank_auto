import type { Document } from '../../domain/document.js';
import type { DocumentContent } from '../../domain/document-content.js';

/** 提交人工编辑后的完整文档. Runtime validation is not implemented yet. */
export interface ReplaceDocumentContentInput {
  path: {
    documentId: string;
  };
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
  body: DocumentContent;
}

export type ReplaceDocumentContentResult = Document;
