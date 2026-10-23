import type { QuestionExtractInput } from './contracts/question-extract-input.js';
import type { QuestionExtractOutput } from './contracts/question-extract-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface QuestionExtractSkill {
  readonly id: 'question-extract';
  execute(
    input: QuestionExtractInput,
    context: SkillExecutionContext,
  ): Promise<QuestionExtractOutput>;
}
