import { z } from 'zod';
import { Id } from '../../textbooks/domain/content.js';
export const ChatInput = z.strictObject({ text: z.string().trim().min(1).max(20000) });
export const Conversation = z.strictObject({
  id: Id,
  title: z.string(),
  updatedAt: z.string(),
  messages: z.array(
    z.strictObject({
      id: Id,
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      status: z.enum(['complete', 'pending', 'failed']),
      error: z.string().nullable(),
    }),
  ),
});
export type Conversation = z.infer<typeof Conversation>;
