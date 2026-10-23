import type { BoundaryDetectInput } from './contracts/boundary-detect-input.js';
import type { BoundaryDetectOutput } from './contracts/boundary-detect-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface QuestionBoundaryDetectSkill {
  readonly id: 'question-boundary-detect';
  execute(
    input: BoundaryDetectInput,
    context: SkillExecutionContext,
  ): Promise<BoundaryDetectOutput>;
}
