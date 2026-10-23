import type { SkillBinding } from './skill-binding.js';

/** AiConfiguration contract. */
export type AiConfiguration = {
  revision: number;
  bindings: SkillBinding[];
};
