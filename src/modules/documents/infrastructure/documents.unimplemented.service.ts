import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { DocumentsService } from '../application/documents.service.interface.js';
import type {
  CreateDocumentInput,
  CreateDocumentResult,
} from '../application/commands/create-document.command.js';
import type {
  ListDocumentsInput,
  ListDocumentsResult,
} from '../application/commands/list-documents.command.js';
import type {
  GetDocumentInput,
  GetDocumentResult,
} from '../application/commands/get-document.command.js';
import type {
  ReplaceDocumentContentInput,
  ReplaceDocumentContentResult,
} from '../application/commands/replace-document-content.command.js';
import type {
  ValidateDocumentInput,
  ValidateDocumentResult,
} from '../application/commands/validate-document.command.js';
import type {
  ListDocumentRevisionsInput,
  ListDocumentRevisionsResult,
} from '../application/commands/list-document-revisions.command.js';
import type {
  GetDocumentRevisionInput,
  GetDocumentRevisionResult,
} from '../application/commands/get-document-revision.command.js';
import type {
  RestoreDocumentRevisionInput,
  RestoreDocumentRevisionResult,
} from '../application/commands/restore-document-revision.command.js';

@Injectable()
export class DocumentsUnimplementedService implements DocumentsService {
  async createDocument(_input: CreateDocumentInput): Promise<CreateDocumentResult> {
    throw new OperationNotImplemented('createDocument');
  }

  async listDocuments(_input: ListDocumentsInput): Promise<ListDocumentsResult> {
    throw new OperationNotImplemented('listDocuments');
  }

  async getDocument(_input: GetDocumentInput): Promise<GetDocumentResult> {
    throw new OperationNotImplemented('getDocument');
  }

  async replaceDocumentContent(
    _input: ReplaceDocumentContentInput,
  ): Promise<ReplaceDocumentContentResult> {
    throw new OperationNotImplemented('replaceDocumentContent');
  }

  async validateDocument(_input: ValidateDocumentInput): Promise<ValidateDocumentResult> {
    throw new OperationNotImplemented('validateDocument');
  }

  async listDocumentRevisions(
    _input: ListDocumentRevisionsInput,
  ): Promise<ListDocumentRevisionsResult> {
    throw new OperationNotImplemented('listDocumentRevisions');
  }

  async getDocumentRevision(_input: GetDocumentRevisionInput): Promise<GetDocumentRevisionResult> {
    throw new OperationNotImplemented('getDocumentRevision');
  }

  async restoreDocumentRevision(
    _input: RestoreDocumentRevisionInput,
  ): Promise<RestoreDocumentRevisionResult> {
    throw new OperationNotImplemented('restoreDocumentRevision');
  }
}
