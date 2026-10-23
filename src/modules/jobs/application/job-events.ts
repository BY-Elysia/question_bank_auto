import type { Job } from '../domain/job.js';
export function addEvent(job: Job, message: string) {
  job.updatedAt = new Date().toISOString();
  job.events.push({ at: job.updatedAt, message });
  if (job.events.length > 200) job.events = job.events.slice(-200);
}
