/** ArtifactUpload contract. */
export type ArtifactUpload = {
  /** Format: uuid */
  leaseId: string;
  fencingToken: number;
  /** Format: uuid */
  stepId: string;
  /** @enum {string} */
  kind: 'page' | 'crop' | 'candidate' | 'model_response' | 'log' | 'export';
  /** Format: binary */
  file: string;
  sha256: string;
};
