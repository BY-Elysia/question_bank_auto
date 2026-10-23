import type { SkillBinding } from '../../domain/skill-binding.js';

/** AiConfigurationUpdate contract. */
export type AiConfigurationUpdate = {
  bindings: SkillBinding[];
};
