import type { ToolContext } from '../domain/knowledge.js';
export interface DeferredTask {
  workspaceId: string;
  jobId: string;
}
export interface DeferredTasks {
  cancel(context: ToolContext): Promise<void>;
  settle(context: ToolContext, task: DeferredTask, signal: AbortSignal): Promise<unknown>;
}
