import type { AnswerGenerateOutput } from '../../skills/answer-generate/contracts/answer-generate-output.js';
import type { BoundaryDetectOutput } from '../../skills/question-boundary-detect/contracts/boundary-detect-output.js';
import type { LibrarySearchOutput } from '../../skills/question-bank-search/contracts/library-search-output.js';
import type { MathRepairOutput } from '../../skills/math-format-repair/contracts/math-repair-output.js';
import type { QuestionExtractOutput } from '../../skills/question-extract/contracts/question-extract-output.js';
import type { QuestionRepairOutput } from '../../skills/question-repair/contracts/question-repair-output.js';
import type { QuestionTypeOutput } from '../../skills/question-type-classify/contracts/question-type-output.js';
import type { SourceVerifyOutput } from '../../skills/question-source-verify/contracts/source-verify-output.js';
import type { StructureDetectOutput } from '../../skills/document-structure-detect/contracts/structure-detect-output.js';
import type { StructuredRepairOutput } from '../../skills/structured-output-repair/contracts/structured-repair-output.js';

/** SkillOutput contract. */
export type SkillOutput =
  | StructureDetectOutput
  | BoundaryDetectOutput
  | QuestionExtractOutput
  | SourceVerifyOutput
  | StructuredRepairOutput
  | QuestionRepairOutput
  | MathRepairOutput
  | AnswerGenerateOutput
  | QuestionTypeOutput
  | LibrarySearchOutput;
