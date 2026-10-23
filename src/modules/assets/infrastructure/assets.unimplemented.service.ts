import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { AssetsService } from '../application/assets.service.interface.js';
import type {
  UploadAssetInput,
  UploadAssetResult,
} from '../application/commands/upload-asset.command.js';
import type {
  ListAssetsInput,
  ListAssetsResult,
} from '../application/commands/list-assets.command.js';
import type { GetAssetInput, GetAssetResult } from '../application/commands/get-asset.command.js';
import type {
  DeleteAssetInput,
  DeleteAssetResult,
} from '../application/commands/delete-asset.command.js';
import type {
  DownloadAssetInput,
  DownloadAssetResult,
} from '../application/commands/download-asset.command.js';

@Injectable()
export class AssetsUnimplementedService implements AssetsService {
  async uploadAsset(_input: UploadAssetInput): Promise<UploadAssetResult> {
    throw new OperationNotImplemented('uploadAsset');
  }

  async listAssets(_input: ListAssetsInput): Promise<ListAssetsResult> {
    throw new OperationNotImplemented('listAssets');
  }

  async getAsset(_input: GetAssetInput): Promise<GetAssetResult> {
    throw new OperationNotImplemented('getAsset');
  }

  async deleteAsset(_input: DeleteAssetInput): Promise<DeleteAssetResult> {
    throw new OperationNotImplemented('deleteAsset');
  }

  async downloadAsset(_input: DownloadAssetInput): Promise<DownloadAssetResult> {
    throw new OperationNotImplemented('downloadAsset');
  }
}
