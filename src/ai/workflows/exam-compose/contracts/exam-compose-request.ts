import type { ExamSectionSelection } from './exam-section-selection.js';

/** ExamComposeRequest contract. */
export type ExamComposeRequest = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'exam-compose';
  /** Format: uuid */
  documentId: string;
  baseRevision: number;
  sections: ExamSectionSelection[];
};
