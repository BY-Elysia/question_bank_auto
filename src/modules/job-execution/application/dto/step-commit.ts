import type { Checkpoint } from '../../domain/checkpoint.js';
import type { JobStep } from '../../../jobs/domain/job-step.js';
import type { LeaseContext } from '../../domain/lease-context.js';
import type { SkillOutput } from '../../../../ai/runtime/contracts/skill-output.js';

/** Skill 步骤要求 output.kind 与计划一致并按 Skill schema 校验；确定性步骤可省略 output。stepId+attempt 幂等，检查点 sequence 单调递增。 */
export type StepCommit = {
  lease: LeaseContext;
  step: JobStep;
  checkpoint: Checkpoint;
  artifactIds: string[];
  output?: SkillOutput;
};
