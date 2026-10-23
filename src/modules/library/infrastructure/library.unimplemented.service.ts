import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { LibraryService } from '../application/library.service.interface.js';
import type {
  PublishDocumentInput,
  PublishDocumentResult,
} from '../application/commands/publish-document.command.js';
import type {
  ListPublicationsInput,
  ListPublicationsResult,
} from '../application/commands/list-publications.command.js';
import type {
  GetPublicationInput,
  GetPublicationResult,
} from '../application/commands/get-publication.command.js';
import type {
  WithdrawPublicationInput,
  WithdrawPublicationResult,
} from '../application/commands/withdraw-publication.command.js';
import type {
  ListPublicationNodesInput,
  ListPublicationNodesResult,
} from '../application/commands/list-publication-nodes.command.js';
import type {
  SearchLibraryQuestionsInput,
  SearchLibraryQuestionsResult,
} from '../application/commands/search-library-questions.command.js';
import type {
  GetLibraryQuestionInput,
  GetLibraryQuestionResult,
} from '../application/commands/get-library-question.command.js';

@Injectable()
export class LibraryUnimplementedService implements LibraryService {
  async publishDocument(_input: PublishDocumentInput): Promise<PublishDocumentResult> {
    throw new OperationNotImplemented('publishDocument');
  }

  async listPublications(_input: ListPublicationsInput): Promise<ListPublicationsResult> {
    throw new OperationNotImplemented('listPublications');
  }

  async getPublication(_input: GetPublicationInput): Promise<GetPublicationResult> {
    throw new OperationNotImplemented('getPublication');
  }

  async withdrawPublication(_input: WithdrawPublicationInput): Promise<WithdrawPublicationResult> {
    throw new OperationNotImplemented('withdrawPublication');
  }

  async listPublicationNodes(
    _input: ListPublicationNodesInput,
  ): Promise<ListPublicationNodesResult> {
    throw new OperationNotImplemented('listPublicationNodes');
  }

  async searchLibraryQuestions(
    _input: SearchLibraryQuestionsInput,
  ): Promise<SearchLibraryQuestionsResult> {
    throw new OperationNotImplemented('searchLibraryQuestions');
  }

  async getLibraryQuestion(_input: GetLibraryQuestionInput): Promise<GetLibraryQuestionResult> {
    throw new OperationNotImplemented('getLibraryQuestion');
  }
}
