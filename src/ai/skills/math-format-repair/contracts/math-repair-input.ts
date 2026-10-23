/** MathRepairInput contract. */
export type MathRepairInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'math-format-repair';
  text: string;
  sourceAssetIds: string[];
};
