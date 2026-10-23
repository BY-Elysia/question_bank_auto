import type { UserScope } from '../../../shared/contracts/identity-context.js';
import type { Document } from '../domain/document.js';
import type { DocumentContent } from '../domain/document-content.js';
import type { DocumentRevision } from '../domain/document-revision.js';

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

/** Persistence must enforce ownership and revision comparison atomically. */
export interface DocumentRepository {
  find(scope: UserScope, documentId: string): Promise<Document | null>;
  findRevision(
    scope: UserScope,
    documentId: string,
    revision: number,
  ): Promise<DocumentRevision | null>;
  create(scope: UserScope, projectId: string, content: DocumentContent): Promise<Document>;
  compareAndSwap(
    scope: UserScope,
    documentId: string,
    expectedRevision: number,
    content: DocumentContent,
  ): Promise<{ kind: 'saved'; document: Document } | { kind: 'conflict' } | { kind: 'not_found' }>;
}
