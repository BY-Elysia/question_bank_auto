import type { QuestionRepairInput } from './contracts/question-repair-input.js';
import type { QuestionRepairOutput } from './contracts/question-repair-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface QuestionRepairSkill {
  readonly id: 'question-repair';
  execute(
    input: QuestionRepairInput,
    context: SkillExecutionContext,
  ): Promise<QuestionRepairOutput>;
}
