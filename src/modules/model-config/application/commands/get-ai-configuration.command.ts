import type { AiConfiguration } from '../../domain/ai-configuration.js';

/** 读取用户 Skill 模型绑定. Runtime validation is not implemented yet. */
export interface GetAiConfigurationInput {}

export type GetAiConfigurationResult = AiConfiguration;
