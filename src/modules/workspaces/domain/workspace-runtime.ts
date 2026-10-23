import type { Problem } from '../../../shared/errors/problem.js';

/** WorkspaceRuntime contract. */
export type WorkspaceRuntime = {
  /** @enum {string} */
  desiredState: 'running' | 'stopped';
  /** @enum {string} */
  state: 'unprovisioned' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  generation: number;
  observedGeneration: number;
  /** Format: date-time */
  updatedAt: string;
  error: Problem | null;
};
