import { z } from 'zod';
import { Id, Source, Question, Leaf, QuestionType } from '../../textbooks/domain/content.js';
export const QuestionAddress = z.object({
  workspaceId: Id,
  contentId: Id,
  childIndex: z.number().int().nonnegative().nullable().default(null),
  revision: z.number().int().nonnegative().optional(),
});
export type QuestionAddress = z.infer<typeof QuestionAddress>;
export const QuestionSearch = z.object({
  query: z.string().trim().max(300).default(''),
  section: z.string().max(200).default(''),
  type: QuestionType.optional(),
  answer: z.enum(['any', 'missing', 'present', 'pending']).default('any'),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(20).default(10),
});
export type QuestionSearch = z.infer<typeof QuestionSearch>;
export const CatalogQuestion = QuestionAddress.extend({
  revision: z.number().int(),
  title: z.string(),
  section: z.string(),
  label: z.string(),
  parentPrompt: z.string(),
  question: z.union([Question, Leaf]),
  sources: z.array(Source),
  searchable: z.boolean(),
});
export type CatalogQuestion = z.infer<typeof CatalogQuestion>;
export const CatalogWorkspace = z.object({
  id: Id,
  title: z.string(),
  status: z.string(),
  totalPages: z.number(),
});
export type CatalogWorkspace = z.infer<typeof CatalogWorkspace>;
