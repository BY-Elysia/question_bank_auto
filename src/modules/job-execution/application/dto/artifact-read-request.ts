import type { LeaseContext } from '../../domain/lease-context.js';

/** ArtifactReadRequest contract. */
export type ArtifactReadRequest = {
  lease: LeaseContext;
  /** Format: uuid */
  artifactId: string;
};
