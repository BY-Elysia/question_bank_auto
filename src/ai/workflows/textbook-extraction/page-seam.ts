import { spatialOutput } from './spatial-contract.js';
import { z } from 'zod';
import type { Document, Range } from '../../../modules/textbooks/domain/content.js';
import { Source } from '../../../modules/textbooks/domain/content.js';
import type { Skills, SkillContext } from '../../ports/skills.js';
import { readingOrder } from './guards.js';
const Seam = z.strictObject({
  targetKey: z.string(),
  decision: z.enum(['continues', 'independent', 'uncertain']),
  sources: z.array(Source),
  reason: z.string().min(1),
});
function lastSourceOn(sources: Range['sources'], page: number) {
  return sources.filter((s) => s.page === page).at(-1);
}

/** Reconsider a previously closed question before committing the next page. No published document is edited. */
export async function reconcileSeam(
  skills: Skills,
  stage: Document,
  pending: Range[],
  page: number,
  context: SkillContext,
) {
  const prior = stage.contents
    .filter((c) => c.sources.some((s) => s.page === page - 1))
    .sort((a, b) => {
      const sa = lastSourceOn(a.sources, page - 1);
      const sb = lastSourceOn(b.sources, page - 1);
      if (sa && sb) return sa.box[1]! - sb.box[1]! || sa.box[0]! - sb.box[0]!;
      return readingOrder(a, b);
    })
    .at(-1);
  if (page === 1 || pending.length || !prior?.question || prior.sources.some((s) => s.page >= page))
    return pending;
  const result = await skills.run(
    'cross-page-reconcile',
    {
      mode: 'seam',
      page,
      previous: prior,
      instruction:
        'Independently inspect the first substantive lines of the current page, including a short proof summary. Do they finish this previous question? Do not infer from whether its previous answer already has a conclusion.',
    },
    Seam,
    [...new Set([...prior.sources.map((s) => s.page), page])],
    context,
    spatialOutput('seam'),
  );
  if (result.targetKey !== prior.key || result.sources.some((s) => s.page !== page))
    throw new Error('Invalid seam evidence target or page');
  if (result.decision !== 'continues' && result.sources.length)
    throw new Error('Unexpected seam evidence');
  if (result.decision === 'continues') {
    if (!result.sources.length) throw new Error('Continuation requires source evidence');
    stage.contents = stage.contents.filter((c) => c.id !== prior.id);
    stage.issues = stage.issues.filter((i) => i.contentId !== prior.id);
    return [
      {
        key: prior.key,
        kind: prior.kind,
        sectionId: prior.sectionId,
        sources: [...prior.sources, ...result.sources],
        label: prior.question.label,
      },
    ];
  }
  if (result.decision === 'uncertain')
    stage.issues.push({
      code: 'PAGE_SEAM_UNCERTAIN',
      severity: 'warning',
      page,
      contentId: prior.id,
      message: `Cross-page ownership needs review: ${result.reason}`,
    });
  return pending;
}
