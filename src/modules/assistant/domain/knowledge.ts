import { QuestionAddress } from '../../catalog/domain/catalog.js';
import { z } from 'zod';
import { Id, Source } from '../../textbooks/domain/content.js';
export const ScopeInput = z.object({
  workspaceIds: z.array(Id).max(10),
  focus: QuestionAddress.nullable().default(null),
});
export const KnowledgeScope = ScopeInput.extend({
  epoch: z.number().int(),
  historyStart: z.number().int(),
});
export type KnowledgeScope = z.infer<typeof KnowledgeScope>;
export interface ToolContext {
  step?: number;
  conversationId: string;
  runId: string;
  principalId: string;
  scope: KnowledgeScope;
}
export const Citation = z.object({
  id: Id,
  workspaceId: Id,
  contentId: Id,
  childIndex: z.number().nullable(),
  revision: z.number(),
  title: z.string(),
  label: z.string(),
  section: z.string(),
  sources: z.array(Source),
  excerpt: z.string(),
  answerOrigin: z.string().nullable(),
  answerReview: z.string().nullable(),
});
export type Citation = z.infer<typeof Citation>;
export interface Evidence extends Citation {
  conversationId: string;
  runId: string;
  scopeEpoch: number;
}
export const CitationView = z.object({
  citation: Citation,
  currentRevision: z.number().nullable(),
  status: z.enum(['current', 'changed', 'deleted']),
});
export type CitationView = z.infer<typeof CitationView>;
