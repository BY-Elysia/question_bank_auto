import type { z } from 'zod';
import type { SkillId } from './skill-catalog.js';
export interface SkillContext {
  bookId: string;
  jobId: string;
  signal: AbortSignal;
}
export interface OutputContract {
  schema: z.ZodType;
  /** Bounded text envelope; identity and JSON serialization remain backend-owned. */
  parseText?(text: string): unknown;
  maxOutputTokens?: number;
  instructions: string;
  encode?(value: unknown): unknown;
  decode(value: unknown): unknown;
}
export interface Skills {
  run<T extends z.ZodType>(
    id: SkillId,
    input: unknown,
    schema: T,
    pages: number[],
    context: SkillContext,
    output?: OutputContract,
  ): Promise<z.infer<T>>;
}

export class StructuredOutputError extends Error {}
