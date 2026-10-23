import type { ModelParameters } from './model-parameters.js';
import type { ModelRole } from './model-role.js';

/** ModelProfile contract. */
export type ModelProfile = {
  /** Format: uuid */
  id: string;
  revision: number;
  name: string;
  role: ModelRole;
  providerId: string;
  modelId: string;
  credentialId: string | null;
  parameters: ModelParameters;
  /** Format: date-time */
  createdAt: string;
  /** Format: date-time */
  updatedAt: string;
};
