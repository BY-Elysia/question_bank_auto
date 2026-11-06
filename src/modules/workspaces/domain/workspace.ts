import { z } from 'zod';
import { TextbookMetadata } from '../../textbooks/domain/metadata.js';
import { Id } from '../../textbooks/domain/content.js';
export const ExtractionSettings = z.strictObject({
  metadata: TextbookMetadata,
  instructions: z.string().max(8000).default(''),
  cache: z.enum(['prefix', 'off']).default('prefix'),
  mode: z.enum(['sequential', 'chapters']).default('sequential'),
  chapters: z
    .array(z.strictObject({ pages: z.array(z.number().int().positive()).min(1) }))
    .max(100)
    .default([]),
  concurrency: z.number().int().min(1).max(4).default(2),
});
export type ExtractionSettings = z.infer<typeof ExtractionSettings>;
export const Workspace = z.strictObject({
  id: Id,
  title: z.string(),
  sourceKind: z.enum(['pdf', 'images']),
  status: z.enum([
    'deleting',
    'preparing',
    'ready',
    'extracting',
    'completed',
    'needs_review',
    'failed',
    'cancelled',
    'interrupted',
  ]),
  preparedPages: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  settings: ExtractionSettings.nullable(),
  runId: Id.nullable(),
  baseRevision: z.number().int().nonnegative(),
  mergedRevision: z.number().int().nullable(),
  answersJobId: Id.nullable(),
  chapters: z.array(
    z.strictObject({
      id: Id,
      pages: z.array(z.number().int().positive()),
      bookId: Id,
      jobId: Id.nullable(),
      title: z.string().nullable(),
      status: z.enum(['queued', 'running', 'completed', 'needs_review', 'failed']),
      error: z.string().nullable(),
    }),
  ),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workspace = z.infer<typeof Workspace>;
