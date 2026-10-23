import type { CropImageOutput } from './crop-image-output.js';

/** AssetsCropImageResult contract. */
export type AssetsCropImageResult = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'assets.crop-image';
  output: CropImageOutput;
};
