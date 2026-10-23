/** DocumentExportRequest contract. */
export type DocumentExportRequest = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'document-export';
  /** Format: uuid */
  documentId: string;
  revision: number;
  /** @enum {string} */
  format: 'question-bank-json' | 'question-bank-bundle';
  includeMedia: boolean;
};
