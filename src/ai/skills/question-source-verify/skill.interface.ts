import type { SourceVerifyInput } from './contracts/source-verify-input.js';
import type { SourceVerifyOutput } from './contracts/source-verify-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface QuestionSourceVerifySkill {
  readonly id: 'question-source-verify';
  execute(input: SourceVerifyInput, context: SkillExecutionContext): Promise<SourceVerifyOutput>;
}
