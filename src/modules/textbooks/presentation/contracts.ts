import { z } from 'zod';
import { Document, Content } from '../domain/content.js';
export const ReplaceDocument = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  document: Document,
});
export const EditContent = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  content: Content,
});
export const Decision = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(['accept', 'reject']),
});
export const Restore = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
});
