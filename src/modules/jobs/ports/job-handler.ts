import type { SkillContext } from '../../../ai/ports/skills.js';
import type { JobRequest, Job } from '../domain/job.js';
export interface JobHandler {
  /** True only after this handler has atomically persisted its final result. */
  isCommitted?(job: Job): boolean;
  execute(context: SkillContext): Promise<void>;
}
export type JobHandlers = ReadonlyMap<JobRequest['kind'], JobHandler>;
