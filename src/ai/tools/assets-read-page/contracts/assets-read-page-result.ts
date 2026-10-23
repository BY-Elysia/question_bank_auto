import type { ReadPageOutput } from './read-page-output.js';

/** AssetsReadPageResult contract. */
export type AssetsReadPageResult = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'assets.read-page';
  output: ReadPageOutput;
};
