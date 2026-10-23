import type { ModelProfileList } from '../dto/model-profile-list.js';

/** 列出模型配置. Runtime validation is not implemented yet. */
export interface ListModelProfilesInput {}

export type ListModelProfilesResult = ModelProfileList;
