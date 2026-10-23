import type { CropBox } from '../../../../modules/assets/domain/crop-box.js';

/** CropImageInput contract. */
export type CropImageInput = {
  /** Format: uuid */
  assetId: string;
  region: CropBox;
};
