import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ASSETS_SERVICE } from '../application/assets.service.interface.js';
import type { AssetsService } from '../application/assets.service.interface.js';
import type { UploadAssetInput, UploadAssetResult } from './dto/upload-asset.dto.js';
import type { ListAssetsInput, ListAssetsResult } from './dto/list-assets.dto.js';
import type { GetAssetInput, GetAssetResult } from './dto/get-asset.dto.js';
import type { DeleteAssetInput, DeleteAssetResult } from './dto/delete-asset.dto.js';
import type { DownloadAssetInput, DownloadAssetResult } from './dto/download-asset.dto.js';

@Controller()
export class AssetsController {
  constructor(@Inject(ASSETS_SERVICE) private readonly service: AssetsService) {}

  /** 上传原始资料或附件 */
  @Post('api/v1/projects/:projectId/assets')
  @HttpCode(201)
  uploadAsset(
    @Param() path: UploadAssetInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: UploadAssetInput['body'],
  ): Promise<UploadAssetResult> {
    return this.service.uploadAsset({ path, headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 列出项目资产 */
  @Get('api/v1/projects/:projectId/assets')
  @HttpCode(200)
  listAssets(
    @Param() path: ListAssetsInput['path'],
    @Query() query: ListAssetsInput['query'],
  ): Promise<ListAssetsResult> {
    return this.service.listAssets({ path, query });
  }

  /** 获取资产元信息 */
  @Get('api/v1/assets/:assetId')
  @HttpCode(200)
  getAsset(@Param() path: GetAssetInput['path']): Promise<GetAssetResult> {
    return this.service.getAsset({ path });
  }

  /** 删除未引用资产 */
  @Delete('api/v1/assets/:assetId')
  @HttpCode(204)
  deleteAsset(
    @Param() path: DeleteAssetInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<DeleteAssetResult> {
    return this.service.deleteAsset({ path, headers: { 'Idempotency-Key': idempotencyKey } });
  }

  /** 下载获授权的资产内容 */
  @Get('api/v1/assets/:assetId/content')
  @HttpCode(200)
  downloadAsset(@Param() path: DownloadAssetInput['path']): Promise<DownloadAssetResult> {
    return this.service.downloadAsset({ path });
  }
}
