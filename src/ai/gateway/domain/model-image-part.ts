/** ModelImagePart contract. */
export type ModelImagePart = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  type: 'asset';
  /** Format: uuid */
  assetId: string;
};
