import type { MathRepairInput } from './contracts/math-repair-input.js';
import type { MathRepairOutput } from './contracts/math-repair-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface MathFormatRepairSkill {
  readonly id: 'math-format-repair';
  execute(input: MathRepairInput, context: SkillExecutionContext): Promise<MathRepairOutput>;
}
