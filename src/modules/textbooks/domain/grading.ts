import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Leaf, Document } from './content.js';
export const RubricItem = z.strictObject({
  rubricItemKey: z.string().regex(/^key_[1-9]\d*$/),
  maxScore: z.number().int().positive(),
  criteria: z.string().trim().min(8).max(2000),
});
export const Scoring = z
  .strictObject({
    defaultScore: z.number().int().positive(),
    rubric: z.array(RubricItem).min(1).max(12),
  })
  .refine(
    (s) => s.rubric.reduce((n, r) => n + r.maxScore, 0) === s.defaultScore,
    'Rubric scores must sum to defaultScore',
  )
  .refine(
    (s) => new Set(s.rubric.map((r) => r.rubricItemKey)).size === s.rubric.length,
    'Rubric keys must be unique',
  );
export const Grading = Scoring.safeExtend({ basis: z.string().regex(/^[a-f0-9]{64}$/) });
export function gradingBasis(leaf: Leaf, sharedPrompt = '') {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sharedPrompt,
        type: leaf.type,
        prompt: leaf.prompt,
        options: leaf.options,
        answer: leaf.answer
          ? { text: leaf.answer.text, explanation: leaf.answer.explanation }
          : null,
      }),
    )
    .digest('hex');
}
export function currentGrading(leaf: Leaf, sharedPrompt = '') {
  return (
    !!leaf.grading &&
    Grading.safeParse(leaf.grading).success &&
    leaf.grading.basis === gradingBasis(leaf, sharedPrompt)
  );
}
export interface ScoringTarget {
  contentId: string;
  childIndex: number | null;
  leaf: Leaf;
  sharedPrompt: string;
}
export function scoringTargets(document: Document): ScoringTarget[] {
  return document.contents.flatMap<ScoringTarget>((content) => {
    const q = content.question;
    if (!q) return [];
    return q.children.length
      ? q.children.map((leaf, childIndex) => ({
          contentId: content.id,
          childIndex,
          leaf,
          sharedPrompt: q.prompt,
        }))
      : [{ contentId: content.id, childIndex: null as number | null, leaf: q, sharedPrompt: '' }];
  });
}
export function scoringReadiness(document: Document) {
  const targets = scoringTargets(document);
  return {
    total: targets.length,
    missing: targets.filter((t) => !currentGrading(t.leaf, t.sharedPrompt)).length,
  };
}
