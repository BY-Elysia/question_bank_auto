import type { AnswerGenerateInput } from '../../../skills/answer-generate/contracts/answer-generate-input.js';
import type { MathRepairInput } from '../../../skills/math-format-repair/contracts/math-repair-input.js';
import type { QuestionRepairInput } from '../../../skills/question-repair/contracts/question-repair-input.js';
import type { QuestionTypeInput } from '../../../skills/question-type-classify/contracts/question-type-input.js';
import type { SourceVerifyInput } from '../../../skills/question-source-verify/contracts/source-verify-input.js';

/** input.question 必须与 baseRevision 中 questionId 对应内容一致；targetPointer 必须定位该题或其子题，且符合 Skill 字段权限。 */
export type QuestionEditRequest = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-edit';
  /** Format: uuid */
  documentId: string;
  baseRevision: number;
  /** Format: uuid */
  questionId: string;
  input:
    | SourceVerifyInput
    | QuestionRepairInput
    | MathRepairInput
    | AnswerGenerateInput
    | QuestionTypeInput;
  targetPointer: string;
};
