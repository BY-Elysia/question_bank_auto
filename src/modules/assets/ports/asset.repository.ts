import type { UserScope } from '../../../shared/contracts/identity-context.js';
import type { Asset } from '../domain/asset.js';

export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');

export interface AssetRepository {
  find(scope: UserScope, assetId: string): Promise<Asset | null>;
  register(scope: UserScope, asset: Asset): Promise<void>;
  hasReferences(scope: UserScope, assetId: string): Promise<boolean>;
  deleteIfUnreferenced(scope: UserScope, assetId: string): Promise<boolean>;
}
