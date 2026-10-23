import type { Asset } from '../../domain/asset.js';
import type { AssetUpload } from '../dto/asset-upload.js';

/** 上传原始资料或附件. Runtime validation is not implemented yet. */
export interface UploadAssetInput {
  path: {
    projectId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: AssetUpload;
}

export type UploadAssetResult = Asset;
