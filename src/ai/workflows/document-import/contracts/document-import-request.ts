/** DocumentImportRequest contract. */
export type DocumentImportRequest = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'document-import';
  /** Format: uuid */
  sourceAssetId: string;
  /** @enum {string} */
  format: 'question-bank-v1' | 'legacy-textbook-json';
};
