/** AssetUpload contract. */
export type AssetUpload = {
  /** @enum {string} */
  kind: 'source' | 'attachment';
  /** Format: binary */
  file: string;
  originalName?: string;
};
