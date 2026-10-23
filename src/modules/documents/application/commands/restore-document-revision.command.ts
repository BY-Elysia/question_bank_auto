import type { Document } from '../../domain/document.js';
import type { RevisionRestore } from '../dto/revision-restore.js';

/** 从历史版本创建新的当前版本. Runtime validation is not implemented yet. */
export interface RestoreDocumentRevisionInput {
  path: {
    documentId: string;
  };
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
  body: RevisionRestore;
}

export type RestoreDocumentRevisionResult = Document;
