import type { ReadPageInput } from './read-page-input.js';

/** AssetsReadPageCall contract. */
export type AssetsReadPageCall = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'assets.read-page';
  input: ReadPageInput;
};
