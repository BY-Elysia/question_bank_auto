import type { Asset } from '../../domain/asset.js';

/** 获取资产元信息. Runtime validation is not implemented yet. */
export interface GetAssetInput {
  path: {
    assetId: string;
  };
}

export type GetAssetResult = Asset;
