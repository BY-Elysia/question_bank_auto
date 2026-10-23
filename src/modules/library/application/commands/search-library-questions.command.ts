import type { LibraryQuery } from '../dto/library-query.js';
import type { QuestionPage } from '../dto/question-page.js';

/** 按确定性条件检索题库. Runtime validation is not implemented yet. */
export interface SearchLibraryQuestionsInput {
  headers: {
    'Idempotency-Key': string;
  };
  body: LibraryQuery;
}

export type SearchLibraryQuestionsResult = QuestionPage;
