/** Positive integral budgets: preserve valid suggestions; apportion excess/deficit by largest remainder. */
export function allocateScores(weights: readonly number[], total: number): number[] {
  if (!Number.isInteger(total) || total < 1 || weights.length < 1 || weights.length > total)
    throw new Error('Score budget cannot cover all scoring criteria');
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 1))
    throw new Error('Scoring weights must be positive safe integers');
  if (weights.reduce((sum, w) => sum + w, 0) === total) return [...weights];
  // Reserve one point per criterion. Allocate the remaining budget without dropping criteria.
  const budget = total - weights.length;
  const extra = weights.map((w) => w - 1);
  const sum = extra.reduce((n, w) => n + w, 0);
  const quotas = extra.map((w) => budget * (sum ? w / sum : 1 / weights.length));
  const result = quotas.map((q) => 1 + Math.floor(q));
  const order = quotas
    .map((q, i) => ({ i, fraction: q - Math.floor(q) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  const remainder = total - result.reduce((n, w) => n + w, 0);
  for (const { i } of order.slice(0, remainder)) result[i]!++;
  return result;
}
