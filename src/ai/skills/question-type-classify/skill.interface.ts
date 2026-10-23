import type { QuestionTypeInput } from './contracts/question-type-input.js';
import type { QuestionTypeOutput } from './contracts/question-type-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface QuestionTypeClassifySkill {
  readonly id: 'question-type-classify';
  execute(input: QuestionTypeInput, context: SkillExecutionContext): Promise<QuestionTypeOutput>;
}
