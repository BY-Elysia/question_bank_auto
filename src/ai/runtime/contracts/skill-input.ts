import type { AnswerGenerateInput } from '../../skills/answer-generate/contracts/answer-generate-input.js';
import type { BoundaryDetectInput } from '../../skills/question-boundary-detect/contracts/boundary-detect-input.js';
import type { LibrarySearchInput } from '../../skills/question-bank-search/contracts/library-search-input.js';
import type { MathRepairInput } from '../../skills/math-format-repair/contracts/math-repair-input.js';
import type { QuestionExtractInput } from '../../skills/question-extract/contracts/question-extract-input.js';
import type { QuestionRepairInput } from '../../skills/question-repair/contracts/question-repair-input.js';
import type { QuestionTypeInput } from '../../skills/question-type-classify/contracts/question-type-input.js';
import type { SourceVerifyInput } from '../../skills/question-source-verify/contracts/source-verify-input.js';
import type { StructureDetectInput } from '../../skills/document-structure-detect/contracts/structure-detect-input.js';
import type { StructuredRepairInput } from '../../skills/structured-output-repair/contracts/structured-repair-input.js';

/** SkillInput contract. */
export type SkillInput =
  | StructureDetectInput
  | BoundaryDetectInput
  | QuestionExtractInput
  | SourceVerifyInput
  | StructuredRepairInput
  | QuestionRepairInput
  | MathRepairInput
  | AnswerGenerateInput
  | QuestionTypeInput
  | LibrarySearchInput;
