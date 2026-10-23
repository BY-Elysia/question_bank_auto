/** 删除未引用资产. Runtime validation is not implemented yet. */
export interface DeleteAssetInput {
  path: {
    assetId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
}

export type DeleteAssetResult = void;
