import type { SkillContext } from '../../../ai/ports/skills.js';
import type { JobRequest } from '../domain/job.js';
export interface JobHandler {
  execute(context: SkillContext): Promise<void>;
}
export type JobHandlers = ReadonlyMap<JobRequest['kind'], JobHandler>;
