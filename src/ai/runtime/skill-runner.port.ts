import type { SkillInput } from './contracts/skill-input.js';
import type { SkillOutput } from './contracts/skill-output.js';
import type { SkillExecutionContext } from './execution-context.js';

export const SKILL_RUNNER = Symbol('SKILL_RUNNER');

export interface SkillRunner {
  execute<K extends SkillInput['kind']>(
    input: Extract<SkillInput, { kind: K }>,
    context: SkillExecutionContext,
  ): Promise<Extract<SkillOutput, { kind: K }>>;
}
