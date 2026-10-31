import type { Book } from '../../../modules/textbooks/domain/book.js';
import type { Job } from '../../../modules/jobs/domain/job.js';
import type { Skills, SkillContext } from '../../ports/skills.js';
import { BoundaryResult, StructureResult, LookaheadResult } from './contracts.js';
import { checkBoundary, readingOrder } from './guards.js';
import { validateDocument } from '../../../modules/textbooks/domain/validation.js';
import { reconcileSeam } from './page-seam.js';
export async function planPage(
  skills: Skills,
  book: Book,
  job: Job,
  page: number,
  context: SkillContext,
) {
  const stage = structuredClone(job.stage!);
  const pending = await reconcileSeam(skills, stage, job.pending, page, context);
  const structure = await skills.run(
    'textbook-structure-detect',
    { page, sections: stage.sections, activeSectionId: job.activeSectionId },
    StructureResult,
    [page],
    context,
  );
  for (const section of structure.sections) {
    if (section.source.page !== page)
      throw new Error('New sections must originate on current page');
    const existing = stage.sections.find((s) => s.id === section.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(section))
      throw new Error('Cannot redefine an existing section');
    if (!existing) stage.sections.push(section);
  }
  const structureErrors = validateDocument({ ...stage, contents: [] }, book.pages.length).filter(
    (i) => !['UNPROCESSED_PAGE'].includes(i.code),
  );
  if (structureErrors.length) throw new Error(`Invalid structure: ${structureErrors[0]!.message}`);
  if (structure.activeSectionId && !stage.sections.some((s) => s.id === structure.activeSectionId))
    throw new Error('Unknown active section');
  const queue = [...new Set([...pending.flatMap((r) => r.sources.map((s) => s.page)), page])].sort(
    (a, b) => a - b,
  );
  if (queue.length > Number(process.env.MAX_PENDING_PAGES ?? 12))
    throw new Error(
      'Pending page budget exceeded; no pages discarded. Review the long/incomplete content before retrying.',
    );
  let boundary: ReturnType<typeof BoundaryResult.parse> | undefined;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    boundary = await skills.run(
      'cross-page-reconcile',
      {
        mode: 'boundary',
        queue,
        pending: pending,
        processed: stage.contents.filter((c) => c.sources.some((s) => queue.includes(s.page))),
        sections: stage.sections,
        activeSectionId: structure.activeSectionId,
        feedback,
      },
      BoundaryResult,
      queue,
      context,
    );
    try {
      checkBoundary(boundary, queue, pending, stage);
      break;
    } catch (error) {
      feedback = String(error);
      boundary = undefined;
    }
  }
  if (!boundary) throw new Error(`Boundary conflict: ${feedback}`);
  // A preview may only change whether the formal queue's tail is complete.
  const tail = [...boundary.complete, ...boundary.pending].sort(readingOrder).at(-1);
  if (tail && page < book.pages.length) {
    let accepted = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const preview = await skills.run(
        'cross-page-reconcile',
        {
          mode: 'lookahead',
          queue,
          previewPage: page + 1,
          tail,
          instruction:
            'Only inspect whether this exact formal tail continues; do not introduce preview content.',
        },
        LookaheadResult,
        [...queue, page + 1],
        context,
      );
      if (preview.tailKey !== tail.key) continue;
      if (preview.continues && boundary.complete.some((r) => r.key === tail.key)) {
        boundary.complete = boundary.complete.filter((r) => r.key !== tail.key);
        boundary.pending.push(tail);
      }
      accepted = true;
      break;
    }
    if (!accepted) throw new Error('Lookahead disagreed with the formal tail twice');
  }
  return { stage, boundary, queue, structure };
}
