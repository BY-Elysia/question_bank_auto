import type {
  CreateDocumentInput,
  CreateDocumentResult,
} from './commands/create-document.command.js';
import type { ListDocumentsInput, ListDocumentsResult } from './commands/list-documents.command.js';
import type { GetDocumentInput, GetDocumentResult } from './commands/get-document.command.js';
import type {
  ReplaceDocumentContentInput,
  ReplaceDocumentContentResult,
} from './commands/replace-document-content.command.js';
import type {
  ValidateDocumentInput,
  ValidateDocumentResult,
} from './commands/validate-document.command.js';
import type {
  ListDocumentRevisionsInput,
  ListDocumentRevisionsResult,
} from './commands/list-document-revisions.command.js';
import type {
  GetDocumentRevisionInput,
  GetDocumentRevisionResult,
} from './commands/get-document-revision.command.js';
import type {
  RestoreDocumentRevisionInput,
  RestoreDocumentRevisionResult,
} from './commands/restore-document-revision.command.js';

export const DOCUMENTS_SERVICE = Symbol('DOCUMENTS_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface DocumentsService {
  createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult>;
  listDocuments(input: ListDocumentsInput): Promise<ListDocumentsResult>;
  getDocument(input: GetDocumentInput): Promise<GetDocumentResult>;
  replaceDocumentContent(input: ReplaceDocumentContentInput): Promise<ReplaceDocumentContentResult>;
  validateDocument(input: ValidateDocumentInput): Promise<ValidateDocumentResult>;
  listDocumentRevisions(input: ListDocumentRevisionsInput): Promise<ListDocumentRevisionsResult>;
  getDocumentRevision(input: GetDocumentRevisionInput): Promise<GetDocumentRevisionResult>;
  restoreDocumentRevision(
    input: RestoreDocumentRevisionInput,
  ): Promise<RestoreDocumentRevisionResult>;
}
