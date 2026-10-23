/** PdfRenderRequest contract. */
export type PdfRenderRequest = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'pdf-render';
  sourceAssetIds: string[];
  dpi: number;
  /** @enum {string} */
  format: 'png' | 'jpeg';
};
