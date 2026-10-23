import type { Id } from '../../../../shared/contracts/id.js';

/** ExportMediaEntry contract. */
export type ExportMediaEntry = {
  assetId: Id;
  relativePath: string;
  sha256: string;
};
