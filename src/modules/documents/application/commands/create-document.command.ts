import type { Document } from '../../domain/document.js';
import type { DocumentCreate } from '../dto/document-create.js';

/** 创建空或预填文档. Runtime validation is not implemented yet. */
export interface CreateDocumentInput {
  path: {
    projectId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: DocumentCreate;
}

export type CreateDocumentResult = Document;
