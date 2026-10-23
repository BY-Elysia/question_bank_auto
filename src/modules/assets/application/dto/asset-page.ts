import type { Asset } from '../../domain/asset.js';
import type { PageInfo } from '../../../../shared/contracts/page-info.js';

/** AssetPage contract. */
export type AssetPage = {
  items: Asset[];
  page: PageInfo;
};
