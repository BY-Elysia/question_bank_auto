import type { SourceEvidence } from '../../../../modules/assets/domain/source-evidence.js';

/** QuestionRange contract. */
export type QuestionRange = {
  key: string;
  evidence: SourceEvidence[];
};
