import type { ToolContext } from '../domain/knowledge.js';
/** Assistant execution authority and mutation notification; no textbook storage access. */
export interface ActionContext {
  validate(context: ToolContext): Promise<void>;
  notify(
    context: ToolContext,
    type: 'workspace_changed',
    data: { workspaceId: string; contentId: string },
  ): void;
}
