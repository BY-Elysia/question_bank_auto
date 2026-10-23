import type { StructuredRepairInput } from './contracts/structured-repair-input.js';
import type { StructuredRepairOutput } from './contracts/structured-repair-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface StructuredOutputRepairSkill {
  readonly id: 'structured-output-repair';
  execute(
    input: StructuredRepairInput,
    context: SkillExecutionContext,
  ): Promise<StructuredRepairOutput>;
}
