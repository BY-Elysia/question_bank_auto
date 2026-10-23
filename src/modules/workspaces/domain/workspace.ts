import type { Quota } from './quota.js';
import type { WorkspaceRuntime } from './workspace-runtime.js';

/** Workspace contract. */
export type Workspace = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  ownerId: string;
  /** @enum {string} */
  directoryLayoutVersion: '1';
  runtime: WorkspaceRuntime;
  quota: Quota;
  /** Format: date-time */
  createdAt: string;
};
