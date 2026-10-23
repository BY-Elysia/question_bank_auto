import type { SkillId } from '../../../ai/runtime/contracts/skill-id.js';

/** SkillBinding contract. */
export type SkillBinding = {
  skillId: SkillId;
  skillVersion: string;
  /** Format: uuid */
  profileId: string;
  profileRevision: number;
};
