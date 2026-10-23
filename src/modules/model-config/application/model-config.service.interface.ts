import type { ListProvidersInput, ListProvidersResult } from './commands/list-providers.command.js';
import type {
  CreateCredentialInput,
  CreateCredentialResult,
} from './commands/create-credential.command.js';
import type {
  ListCredentialsInput,
  ListCredentialsResult,
} from './commands/list-credentials.command.js';
import type {
  RotateCredentialInput,
  RotateCredentialResult,
} from './commands/rotate-credential.command.js';
import type {
  RevokeCredentialInput,
  RevokeCredentialResult,
} from './commands/revoke-credential.command.js';
import type {
  CreateModelProfileInput,
  CreateModelProfileResult,
} from './commands/create-model-profile.command.js';
import type {
  ListModelProfilesInput,
  ListModelProfilesResult,
} from './commands/list-model-profiles.command.js';
import type {
  GetModelProfileInput,
  GetModelProfileResult,
} from './commands/get-model-profile.command.js';
import type {
  UpdateModelProfileInput,
  UpdateModelProfileResult,
} from './commands/update-model-profile.command.js';
import type {
  GetAiConfigurationInput,
  GetAiConfigurationResult,
} from './commands/get-ai-configuration.command.js';
import type {
  UpdateAiConfigurationInput,
  UpdateAiConfigurationResult,
} from './commands/update-ai-configuration.command.js';

export const MODEL_CONFIG_SERVICE = Symbol('MODEL_CONFIG_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface ModelConfigService {
  listProviders(input: ListProvidersInput): Promise<ListProvidersResult>;
  createCredential(input: CreateCredentialInput): Promise<CreateCredentialResult>;
  listCredentials(input: ListCredentialsInput): Promise<ListCredentialsResult>;
  rotateCredential(input: RotateCredentialInput): Promise<RotateCredentialResult>;
  revokeCredential(input: RevokeCredentialInput): Promise<RevokeCredentialResult>;
  createModelProfile(input: CreateModelProfileInput): Promise<CreateModelProfileResult>;
  listModelProfiles(input: ListModelProfilesInput): Promise<ListModelProfilesResult>;
  getModelProfile(input: GetModelProfileInput): Promise<GetModelProfileResult>;
  updateModelProfile(input: UpdateModelProfileInput): Promise<UpdateModelProfileResult>;
  getAiConfiguration(input: GetAiConfigurationInput): Promise<GetAiConfigurationResult>;
  updateAiConfiguration(input: UpdateAiConfigurationInput): Promise<UpdateAiConfigurationResult>;
}
