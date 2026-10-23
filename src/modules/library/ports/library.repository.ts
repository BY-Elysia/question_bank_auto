import type { UserScope } from '../../../shared/contracts/identity-context.js';
import type { LibraryQuestion } from '../domain/library-question.js';
import type { Publication } from '../domain/publication.js';
import type { LibraryQuery } from '../application/dto/library-query.js';
import type { QuestionPage } from '../application/dto/question-page.js';

export const LIBRARY_REPOSITORY = Symbol('LIBRARY_REPOSITORY');

export interface LibraryRepository {
  publish(scope: UserScope, documentId: string, revision: number): Promise<Publication>;
  search(scope: UserScope, query: LibraryQuery): Promise<QuestionPage>;
  findQuestion(scope: UserScope, versionId: string): Promise<LibraryQuestion | null>;
  withdraw(scope: UserScope, publicationId: string): Promise<void>;
}
