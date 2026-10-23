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
import { MODEL_CONFIG_SERVICE } from '../application/model-config.service.interface.js';
import type { ModelConfigService } from '../application/model-config.service.interface.js';
import type { ListProvidersInput, ListProvidersResult } from './dto/list-providers.dto.js';
import type { CreateCredentialInput, CreateCredentialResult } from './dto/create-credential.dto.js';
import type { ListCredentialsInput, ListCredentialsResult } from './dto/list-credentials.dto.js';
import type { RotateCredentialInput, RotateCredentialResult } from './dto/rotate-credential.dto.js';
import type { RevokeCredentialInput, RevokeCredentialResult } from './dto/revoke-credential.dto.js';
import type {
  CreateModelProfileInput,
  CreateModelProfileResult,
} from './dto/create-model-profile.dto.js';
import type {
  ListModelProfilesInput,
  ListModelProfilesResult,
} from './dto/list-model-profiles.dto.js';
import type { GetModelProfileInput, GetModelProfileResult } from './dto/get-model-profile.dto.js';
import type {
  UpdateModelProfileInput,
  UpdateModelProfileResult,
} from './dto/update-model-profile.dto.js';
import type {
  GetAiConfigurationInput,
  GetAiConfigurationResult,
} from './dto/get-ai-configuration.dto.js';
import type {
  UpdateAiConfigurationInput,
  UpdateAiConfigurationResult,
} from './dto/update-ai-configuration.dto.js';

@Controller()
export class ModelConfigController {
  constructor(@Inject(MODEL_CONFIG_SERVICE) private readonly service: ModelConfigService) {}

  /** 列出获授权供应商及模型 */
  @Get('api/v1/ai/providers')
  @HttpCode(200)
  listProviders(): Promise<ListProvidersResult> {
    return this.service.listProviders({});
  }

  /** 加密保存用户模型凭证 */
  @Post('api/v1/ai/credentials')
  @HttpCode(201)
  createCredential(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateCredentialInput['body'],
  ): Promise<CreateCredentialResult> {
    return this.service.createCredential({ headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 列出凭证元信息 */
  @Get('api/v1/ai/credentials')
  @HttpCode(200)
  listCredentials(): Promise<ListCredentialsResult> {
    return this.service.listCredentials({});
  }

  /** 轮换凭证密钥 */
  @Put('api/v1/ai/credentials/:credentialId/secret')
  @HttpCode(200)
  rotateCredential(
    @Param() path: RotateCredentialInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: RotateCredentialInput['body'],
  ): Promise<RotateCredentialResult> {
    return this.service.rotateCredential({
      path,
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
      body,
    });
  }

  /** 撤销凭证 */
  @Delete('api/v1/ai/credentials/:credentialId')
  @HttpCode(204)
  revokeCredential(
    @Param() path: RevokeCredentialInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
  ): Promise<RevokeCredentialResult> {
    return this.service.revokeCredential({
      path,
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
    });
  }

  /** 创建模型用途配置 */
  @Post('api/v1/ai/model-profiles')
  @HttpCode(201)
  createModelProfile(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateModelProfileInput['body'],
  ): Promise<CreateModelProfileResult> {
    return this.service.createModelProfile({
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    });
  }

  /** 列出模型配置 */
  @Get('api/v1/ai/model-profiles')
  @HttpCode(200)
  listModelProfiles(): Promise<ListModelProfilesResult> {
    return this.service.listModelProfiles({});
  }

  /** 读取模型配置 */
  @Get('api/v1/ai/model-profiles/:profileId')
  @HttpCode(200)
  getModelProfile(@Param() path: GetModelProfileInput['path']): Promise<GetModelProfileResult> {
    return this.service.getModelProfile({ path });
  }

  /** 创建模型配置的新版本 */
  @Put('api/v1/ai/model-profiles/:profileId')
  @HttpCode(200)
  updateModelProfile(
    @Param() path: UpdateModelProfileInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: UpdateModelProfileInput['body'],
  ): Promise<UpdateModelProfileResult> {
    return this.service.updateModelProfile({
      path,
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
      body,
    });
  }

  /** 读取用户 Skill 模型绑定 */
  @Get('api/v1/ai/configuration')
  @HttpCode(200)
  getAiConfiguration(): Promise<GetAiConfigurationResult> {
    return this.service.getAiConfiguration({});
  }

  /** 更新用户 Skill 模型绑定 */
  @Put('api/v1/ai/configuration')
  @HttpCode(200)
  updateAiConfiguration(
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: UpdateAiConfigurationInput['body'],
  ): Promise<UpdateAiConfigurationResult> {
    return this.service.updateAiConfiguration({
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
      body,
    });
  }
}
