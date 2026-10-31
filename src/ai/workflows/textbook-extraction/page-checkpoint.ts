import type { Book } from '../../../modules/textbooks/domain/book.js';
import type { Job } from '../../../modules/jobs/domain/job.js';
import type { BookRepository } from '../../../modules/textbooks/ports/book.repository.js';
import type { Skills, SkillContext } from '../../ports/skills.js';
import { planPage } from './plan-page.js';
/** Persist the validated plan before extraction, so a retry cannot shift accepted source boundaries. */
export async function pageCheckpoint(
  store: BookRepository,
  skills: Skills,
  book: Book,
  job: Job,
  page: number,
  context: SkillContext,
) {
  if (job.pagePlan) {
    const plan = job.pagePlan;
    if (plan.page !== page) throw new Error('Page plan does not match checkpoint cursor');
    return {
      stage: structuredClone(job.stage!),
      boundary: { ...structuredClone(plan), blankPages: [], reason: 'Resumed validated page plan' },
      queue: plan.queue,
      structure: { activeSectionId: plan.activeSectionId },
    };
  }
  const result = await planPage(skills, book, job, page, context);
  context.signal.throwIfAborted();
  await store.update(book.id, (current) => {
    const saved = current.jobs.find((j) => j.id === job.id)!;
    saved.stage = structuredClone(result.stage);
    saved.pagePlan = {
      page,
      queue: result.queue,
      complete: result.boundary.complete,
      pending: result.boundary.pending,
      orphanedStarts: result.boundary.orphanedStarts,
      activeSectionId: result.structure.activeSectionId,
    };
  });
  return result;
}
