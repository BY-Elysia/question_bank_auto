import type { SourceEvidence } from '../../../modules/assets/domain/source-evidence.js';

/** SkillIssue contract. */
export type SkillIssue = {
  code: string;
  message: string;
  evidence: SourceEvidence[];
};
