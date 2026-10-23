import type { GeneratedAnswer } from './generated-answer.js';
import type { RubricItem } from '../../../../modules/documents/domain/rubric-item.js';
import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** AnswerGenerateOutput contract. */
export type AnswerGenerateOutput = {
  /** @enum {string} */
  kind: 'answer-generate';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  answer: GeneratedAnswer | null;
  rubric: RubricItem[];
  issues: SkillIssue[];
} & (unknown & {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'answer-generate';
});
