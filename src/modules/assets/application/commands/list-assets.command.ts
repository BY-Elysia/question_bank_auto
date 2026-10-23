import type { AssetPage } from '../dto/asset-page.js';

/** 列出项目资产. Runtime validation is not implemented yet. */
export interface ListAssetsInput {
  path: {
    projectId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListAssetsResult = AssetPage;
