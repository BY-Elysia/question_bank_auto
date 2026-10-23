import type { UserScope } from '../../../shared/contracts/identity-context.js';
import type { ModelProfile } from '../domain/model-profile.js';
import type { AiConfiguration } from '../domain/ai-configuration.js';

export const MODEL_PROFILE_REPOSITORY = Symbol('MODEL_PROFILE_REPOSITORY');

export interface ModelProfileRepository {
  findRevision(scope: UserScope, profileId: string, revision: number): Promise<ModelProfile | null>;
  findBindings(scope: UserScope, revision: number): Promise<AiConfiguration | null>;
}
