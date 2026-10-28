import type { InvocationRecord } from '../ports/skill-catalog.js';
/** Local opt-in traces contain source material; never include image data URLs or credentials. */
export function invocationTrace(
  system: string,
  input: unknown,
  pages: number[],
  rawOutput: string | null,
): Pick<InvocationRecord, 'trace'> {
  return process.env.MODEL_TRACE === '1'
    ? { trace: { system, input, pages: [...new Set(pages)], rawOutput } }
    : {};
}
