import type { ModelProfile } from '../../domain/model-profile.js';
import type { ModelProfileCreate } from '../dto/model-profile-create.js';

/** 创建模型用途配置. Runtime validation is not implemented yet. */
export interface CreateModelProfileInput {
  headers: {
    'Idempotency-Key': string;
  };
  body: ModelProfileCreate;
}

export type CreateModelProfileResult = ModelProfile;
