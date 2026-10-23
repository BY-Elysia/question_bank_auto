import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { ModelConfigService } from '../application/model-config.service.interface.js';
import type {
  ListProvidersInput,
  ListProvidersResult,
} from '../application/commands/list-providers.command.js';
import type {
  CreateCredentialInput,
  CreateCredentialResult,
} from '../application/commands/create-credential.command.js';
import type {
  ListCredentialsInput,
  ListCredentialsResult,
} from '../application/commands/list-credentials.command.js';
import type {
  RotateCredentialInput,
  RotateCredentialResult,
} from '../application/commands/rotate-credential.command.js';
import type {
  RevokeCredentialInput,
  RevokeCredentialResult,
} from '../application/commands/revoke-credential.command.js';
import type {
  CreateModelProfileInput,
  CreateModelProfileResult,
} from '../application/commands/create-model-profile.command.js';
import type {
  ListModelProfilesInput,
  ListModelProfilesResult,
} from '../application/commands/list-model-profiles.command.js';
import type {
  GetModelProfileInput,
  GetModelProfileResult,
} from '../application/commands/get-model-profile.command.js';
import type {
  UpdateModelProfileInput,
  UpdateModelProfileResult,
} from '../application/commands/update-model-profile.command.js';
import type {
  GetAiConfigurationInput,
  GetAiConfigurationResult,
} from '../application/commands/get-ai-configuration.command.js';
import type {
  UpdateAiConfigurationInput,
  UpdateAiConfigurationResult,
} from '../application/commands/update-ai-configuration.command.js';

@Injectable()
export class ModelConfigUnimplementedService implements ModelConfigService {
  async listProviders(_input: ListProvidersInput): Promise<ListProvidersResult> {
    throw new OperationNotImplemented('listProviders');
  }

  async createCredential(_input: CreateCredentialInput): Promise<CreateCredentialResult> {
    throw new OperationNotImplemented('createCredential');
  }

  async listCredentials(_input: ListCredentialsInput): Promise<ListCredentialsResult> {
    throw new OperationNotImplemented('listCredentials');
  }

  async rotateCredential(_input: RotateCredentialInput): Promise<RotateCredentialResult> {
    throw new OperationNotImplemented('rotateCredential');
  }

  async revokeCredential(_input: RevokeCredentialInput): Promise<RevokeCredentialResult> {
    throw new OperationNotImplemented('revokeCredential');
  }

  async createModelProfile(_input: CreateModelProfileInput): Promise<CreateModelProfileResult> {
    throw new OperationNotImplemented('createModelProfile');
  }

  async listModelProfiles(_input: ListModelProfilesInput): Promise<ListModelProfilesResult> {
    throw new OperationNotImplemented('listModelProfiles');
  }

  async getModelProfile(_input: GetModelProfileInput): Promise<GetModelProfileResult> {
    throw new OperationNotImplemented('getModelProfile');
  }

  async updateModelProfile(_input: UpdateModelProfileInput): Promise<UpdateModelProfileResult> {
    throw new OperationNotImplemented('updateModelProfile');
  }

  async getAiConfiguration(_input: GetAiConfigurationInput): Promise<GetAiConfigurationResult> {
    throw new OperationNotImplemented('getAiConfiguration');
  }

  async updateAiConfiguration(
    _input: UpdateAiConfigurationInput,
  ): Promise<UpdateAiConfigurationResult> {
    throw new OperationNotImplemented('updateAiConfiguration');
  }
}
