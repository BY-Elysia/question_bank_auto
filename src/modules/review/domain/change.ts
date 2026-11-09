import { z } from 'zod';
import { Content, Id } from '../../textbooks/domain/content.js';
export const Change = z.object({
  id: Id,
  contentId: Id,
  before: Content,
  after: Content,
  actor: z.enum(['user', 'assistant']),
  principalId: z.string(),
  runId: z.string().nullable(),
  revision: z.number().int(),
  at: z.string(),
  undoneAt: z.string().nullable(),
});
export type Change = z.infer<typeof Change>;
export interface ChangeActor {
  actor: 'user' | 'assistant';
  principalId: string;
  runId: string | null;
}
