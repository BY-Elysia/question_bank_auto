/** Asset contract. */
export type Asset = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  projectId: string;
  /** @enum {string} */
  kind: 'source' | 'page' | 'crop' | 'attachment' | 'export' | 'job_artifact';
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  sourceAssetId: string | null;
  pageNumber: number | null;
  width: number | null;
  height: number | null;
  /** Format: date-time */
  createdAt: string;
};
