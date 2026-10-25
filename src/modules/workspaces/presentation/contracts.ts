import { z } from 'zod';
import { Workspace } from '../domain/workspace.js';
import { Document, Page } from '../../textbooks/domain/content.js';
import { Proposal } from '../../textbooks/domain/book.js';
import { Job } from '../../jobs/domain/job.js';
export const WorkspaceList = z.array(
  Workspace.pick({
    id: true,
    title: true,
    sourceKind: true,
    status: true,
    preparedPages: true,
    totalPages: true,
    updatedAt: true,
  }),
);
export const WorkspaceViewResponse = z.strictObject({
  workspace: Workspace,
  pages: z.array(Page.extend({ imageUrl: z.string() })),
  revision: z.number().int(),
  document: Document,
  proposals: z.array(Proposal),
  jobs: z.array(Job.omit({ stage: true })),
  chapters: z.array(
    Workspace.shape.chapters.element.extend({
      cursor: z.number().int(),
      processedPages: z.number().int(),
      preview: Document.nullable(),
      imageUrls: z.array(z.string()),
    }),
  ),
  sourceUrl: z.string().nullable(),
  exportJsonUrl: z.string(),
  exportZipUrl: z.string(),
  nextStep: z.enum([
    'deleting',
    'preparing',
    'configure_extraction',
    'extracting',
    'retry',
    'review',
  ]),
  actions: z.strictObject({
    delete: z.boolean(),
    configure: z.boolean(),
    cancel: z.boolean(),
    resume: z.boolean(),
    review: z.boolean(),
    export: z.boolean(),
  }),
});
