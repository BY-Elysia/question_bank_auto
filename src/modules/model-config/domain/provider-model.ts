import type { ModelCapabilities } from './model-capabilities.js';

/** ProviderModel contract. */
export type ProviderModel = {
  id: string;
  displayName: string;
  capabilities: ModelCapabilities;
};
