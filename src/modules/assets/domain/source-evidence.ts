import type { CropBox } from './crop-box.js';

/** SourceEvidence contract. */
export type SourceEvidence = {
  /** Format: uuid */
  assetId: string;
  pageNumber?: number;
  region?: CropBox;
  quote?: string;
};
