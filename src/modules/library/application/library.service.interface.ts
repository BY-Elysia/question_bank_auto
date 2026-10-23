import type {
  PublishDocumentInput,
  PublishDocumentResult,
} from './commands/publish-document.command.js';
import type {
  ListPublicationsInput,
  ListPublicationsResult,
} from './commands/list-publications.command.js';
import type {
  GetPublicationInput,
  GetPublicationResult,
} from './commands/get-publication.command.js';
import type {
  WithdrawPublicationInput,
  WithdrawPublicationResult,
} from './commands/withdraw-publication.command.js';
import type {
  ListPublicationNodesInput,
  ListPublicationNodesResult,
} from './commands/list-publication-nodes.command.js';
import type {
  SearchLibraryQuestionsInput,
  SearchLibraryQuestionsResult,
} from './commands/search-library-questions.command.js';
import type {
  GetLibraryQuestionInput,
  GetLibraryQuestionResult,
} from './commands/get-library-question.command.js';

export const LIBRARY_SERVICE = Symbol('LIBRARY_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface LibraryService {
  publishDocument(input: PublishDocumentInput): Promise<PublishDocumentResult>;
  listPublications(input: ListPublicationsInput): Promise<ListPublicationsResult>;
  getPublication(input: GetPublicationInput): Promise<GetPublicationResult>;
  withdrawPublication(input: WithdrawPublicationInput): Promise<WithdrawPublicationResult>;
  listPublicationNodes(input: ListPublicationNodesInput): Promise<ListPublicationNodesResult>;
  searchLibraryQuestions(input: SearchLibraryQuestionsInput): Promise<SearchLibraryQuestionsResult>;
  getLibraryQuestion(input: GetLibraryQuestionInput): Promise<GetLibraryQuestionResult>;
}
