import { z } from 'zod';
import { Content, Document, Id, Page } from './content.js';
import { Job } from '../../jobs/domain/job.js';
export const Proposal = z.strictObject({
  id: Id,
  jobId: Id,
  contentId: Id,
  baseRevision: z.number().int(),
  before: Content,
  after: Content,
  reason: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
});
export const Book = z.strictObject({
  schemaVersion: z.literal('1.0'),
  id: Id,
  title: z.string().min(1).max(300),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  pages: z.array(Page),
  document: Document,
  jobs: z.array(Job),
  proposals: z.array(Proposal),
});
export type Book = z.infer<typeof Book>;
export type Proposal = z.infer<typeof Proposal>;
export const emptyDocument = () => ({ sections: [], contents: [], issues: [], processedPages: [] });
