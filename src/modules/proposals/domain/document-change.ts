import type { DeleteQuestionChange } from './delete-question-change.js';
import type { ReplaceDocumentChange } from './replace-document-change.js';
import type { ReplaceStructureChange } from './replace-structure-change.js';
import type { UpsertQuestionChange } from './upsert-question-change.js';

/** DocumentChange contract. */
export type DocumentChange =
  ReplaceDocumentChange | UpsertQuestionChange | DeleteQuestionChange | ReplaceStructureChange;
