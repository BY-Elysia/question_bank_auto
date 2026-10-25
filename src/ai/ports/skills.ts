import type { z } from 'zod';
import type { SkillId } from './skill-catalog.js';
export interface SkillContext {
  bookId: string;
  jobId: string;
  signal: AbortSignal;
}
export interface Skills {
  run<T extends z.ZodType>(
    id: SkillId,
    input: unknown,
    schema: T,
    pages: number[],
    context: SkillContext,
  ): Promise<z.infer<T>>;
}
