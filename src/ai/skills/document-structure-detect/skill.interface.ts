import type { StructureDetectInput } from './contracts/structure-detect-input.js';
import type { StructureDetectOutput } from './contracts/structure-detect-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface DocumentStructureDetectSkill {
  readonly id: 'document-structure-detect';
  execute(
    input: StructureDetectInput,
    context: SkillExecutionContext,
  ): Promise<StructureDetectOutput>;
}
