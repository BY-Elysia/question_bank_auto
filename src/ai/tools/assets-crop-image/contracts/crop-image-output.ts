import type { CropBox } from '../../../../modules/assets/domain/crop-box.js';

/** CropImageOutput contract. */
export type CropImageOutput = {
  /** Format: uuid */
  artifactId: string;
  /** Format: uuid */
  sourceAssetId: string;
  region: CropBox;
};
