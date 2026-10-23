import type { DownloadContent } from '../../../../shared/contracts/transport.js';

/** 下载获授权的资产内容. Runtime validation is not implemented yet. */
export interface DownloadAssetInput {
  path: {
    assetId: string;
  };
}

export type DownloadAssetResult = DownloadContent;
