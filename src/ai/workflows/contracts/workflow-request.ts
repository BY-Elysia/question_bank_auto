import type { DocumentExportRequest } from '../document-export/contracts/document-export-request.js';
import type { DocumentImportRequest } from '../document-import/contracts/document-import-request.js';
import type { ExamComposeRequest } from '../exam-compose/contracts/exam-compose-request.js';
import type { ExamExtractionRequest } from '../exam-extraction/contracts/exam-extraction-request.js';
import type { LibrarySearchRequest } from '../library-search/contracts/library-search-request.js';
import type { PdfRenderRequest } from '../pdf-render/contracts/pdf-render-request.js';
import type { QuestionEditRequest } from '../question-edit/contracts/question-edit-request.js';
import type { TextbookExtractionRequest } from '../textbook-extraction/contracts/textbook-extraction-request.js';

/** WorkflowRequest contract. */
export type WorkflowRequest =
  | PdfRenderRequest
  | DocumentImportRequest
  | TextbookExtractionRequest
  | ExamExtractionRequest
  | QuestionEditRequest
  | LibrarySearchRequest
  | ExamComposeRequest
  | DocumentExportRequest;
