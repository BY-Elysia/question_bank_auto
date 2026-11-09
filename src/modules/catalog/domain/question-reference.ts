import { z } from 'zod';
import type { QuestionAddress } from './catalog.js';
/** A canonical locator keeps models from rebuilding nullable child indices or dropping revisions. */
export const QuestionReference = z
  .string()
  .max(240)
  .regex(/^[a-zA-Z0-9_-]{1,100}:\d+:[a-zA-Z0-9_-]{1,100}:(root|\d+)$/);
export function questionReference(address: QuestionAddress & { revision: number }): string {
  return `${address.workspaceId}:${address.revision}:${address.contentId}:${address.childIndex ?? 'root'}`;
}
export function questionAddress(reference: string): QuestionAddress {
  const [workspaceId, revision, contentId, child] = QuestionReference.parse(reference).split(':');
  return {
    workspaceId: workspaceId!,
    contentId: contentId!,
    revision: Number(revision),
    childIndex: child === 'root' ? null : Number(child),
  };
}
