import type { UploadAssetInput, UploadAssetResult } from './commands/upload-asset.command.js';
import type { ListAssetsInput, ListAssetsResult } from './commands/list-assets.command.js';
import type { GetAssetInput, GetAssetResult } from './commands/get-asset.command.js';
import type { DeleteAssetInput, DeleteAssetResult } from './commands/delete-asset.command.js';
import type { DownloadAssetInput, DownloadAssetResult } from './commands/download-asset.command.js';

export const ASSETS_SERVICE = Symbol('ASSETS_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface AssetsService {
  uploadAsset(input: UploadAssetInput): Promise<UploadAssetResult>;
  listAssets(input: ListAssetsInput): Promise<ListAssetsResult>;
  getAsset(input: GetAssetInput): Promise<GetAssetResult>;
  deleteAsset(input: DeleteAssetInput): Promise<DeleteAssetResult>;
  downloadAsset(input: DownloadAssetInput): Promise<DownloadAssetResult>;
}
