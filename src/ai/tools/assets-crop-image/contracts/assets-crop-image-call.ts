import type { CropImageInput } from './crop-image-input.js';

/** AssetsCropImageCall contract. */
export type AssetsCropImageCall = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'assets.crop-image';
  input: CropImageInput;
};
