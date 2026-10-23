import type { UserScope } from '../../../shared/contracts/identity-context.js';

export const ASSET_STORAGE = Symbol('ASSET_STORAGE');

/** Adapters resolve IDs to paths; application code cannot supply arbitrary paths. */
export interface AssetStorage {
  read(scope: UserScope, assetId: string): Promise<AsyncIterable<Uint8Array>>;
  stage(
    scope: UserScope,
    assetId: string,
    bytes: AsyncIterable<Uint8Array>,
  ): Promise<{
    sha256: string;
    sizeBytes: number;
  }>;
  remove(scope: UserScope, assetId: string): Promise<void>;
}
