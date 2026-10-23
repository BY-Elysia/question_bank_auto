import type { Question } from '../../documents/domain/question.js';

/** LibraryQuestion contract. */
export type LibraryQuestion = {
  /** Format: uuid */
  versionId: string;
  /** Format: uuid */
  publicationId: string;
  /** Format: uuid */
  sourceDocumentId: string;
  sourceRevision: number;
  question: Question;
};
