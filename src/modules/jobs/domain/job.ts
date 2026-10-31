import { z } from 'zod';
import { Id, Document, Issue, Range } from '../../textbooks/domain/content.js';
export const JobRequest = z.strictObject({
  kind: z.enum(['parse', 'verify', 'repair', 'answers']),
  startPage: z.number().int().positive().optional(),
  endPage: z.number().int().positive().optional(),
  contentIds: z.array(Id).max(10000).optional(),
  sectionId: Id.optional(),
  instruction: z.string().min(1).max(8000).optional(),
  answerMode: z.enum(['extract_visible', 'generate_brief', 'leave_empty']).optional(),
  cache: z.enum(['prefix', 'off']).optional(),
  generateAnswers: z.boolean().optional(),
});
// Immutable accepted page plan: retries resume extraction without asking the model to redraw boundaries.
export const ParsePagePlan = z.strictObject({
  page: z.number().int().positive(),
  queue: z.array(z.number().int().positive()),
  complete: z.array(Range),
  pending: z.array(Range),
  orphanedStarts: z.array(Id),
  activeSectionId: Id.nullable(),
});
export const Job = z.strictObject({
  id: Id,
  kind: JobRequest.shape.kind,
  status: z.enum([
    'queued',
    'running',
    'completed',
    'needs_review',
    'failed',
    'cancelled',
    'interrupted',
  ]),
  request: JobRequest,
  phase: z.enum(['parse', 'review']),
  baseRevision: z.number().int(),
  cursor: z.number().int(),
  startPage: z.number().int(),
  endPage: z.number().int(),
  pending: z.array(Range),
  activeSectionId: Id.nullable(),
  stage: Document.nullable(),
  pagePlan: ParsePagePlan.nullable().default(null),
  processedIds: z.array(Id),
  issues: z.array(Issue),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(z.strictObject({ at: z.string(), message: z.string() })),
});
export type Job = z.infer<typeof Job>;
export type JobRequest = z.infer<typeof JobRequest>;
