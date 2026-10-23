import type { AiConfiguration } from '../../domain/ai-configuration.js';
import type { AiConfigurationUpdate } from '../dto/ai-configuration-update.js';

/** 更新用户 Skill 模型绑定. Runtime validation is not implemented yet. */
export interface UpdateAiConfigurationInput {
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
  body: AiConfigurationUpdate;
}

export type UpdateAiConfigurationResult = AiConfiguration;
