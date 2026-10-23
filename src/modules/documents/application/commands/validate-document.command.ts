import type { DocumentContent } from '../../domain/document-content.js';
import type { ValidationReport } from '../../domain/validation-report.js';

/** 校验候选文档内容. Runtime validation is not implemented yet. */
export interface ValidateDocumentInput {
  path: {
    documentId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: DocumentContent;
}

export type ValidateDocumentResult = ValidationReport;
