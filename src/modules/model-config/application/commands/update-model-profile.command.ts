import type { ModelProfile } from '../../domain/model-profile.js';
import type { ModelProfileCreate } from '../dto/model-profile-create.js';

/** 创建模型配置的新版本. Runtime validation is not implemented yet. */
export interface UpdateModelProfileInput {
  path: {
    profileId: string;
  };
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
  body: ModelProfileCreate;
}

export type UpdateModelProfileResult = ModelProfile;
