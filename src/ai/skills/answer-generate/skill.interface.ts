import type { AnswerGenerateInput } from './contracts/answer-generate-input.js';
import type { AnswerGenerateOutput } from './contracts/answer-generate-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface AnswerGenerateSkill {
  readonly id: 'answer-generate';
  execute(
    input: AnswerGenerateInput,
    context: SkillExecutionContext,
  ): Promise<AnswerGenerateOutput>;
}
