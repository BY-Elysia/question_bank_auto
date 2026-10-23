/** TextbookExtractionRequest contract. */
export type TextbookExtractionRequest = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'textbook-extraction';
  /** Format: uuid */
  documentId: string;
  baseRevision: number;
  pageAssetIds: string[];
  initialNodeId: string | null;
  /** @enum {string} */
  strategy: 'standard' | 'prefix-cache';
  /** @enum {string} */
  verification: 'flagged' | 'all';
  maxPendingPages: number;
};
