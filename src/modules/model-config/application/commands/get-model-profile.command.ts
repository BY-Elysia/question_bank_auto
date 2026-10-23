import type { ModelProfile } from '../../domain/model-profile.js';

/** 读取模型配置. Runtime validation is not implemented yet. */
export interface GetModelProfileInput {
  path: {
    profileId: string;
  };
}

export type GetModelProfileResult = ModelProfile;
