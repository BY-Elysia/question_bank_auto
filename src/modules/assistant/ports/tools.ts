import type { ToolContext } from '../domain/knowledge.js';
import type { Interaction } from '../domain/run.js';
/** Tool definitions are application-owned; adapters translate them to a runtime SDK. */
export interface AssistantTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    callId: string,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<{
    text: string;
    interaction?: Interaction;
    pause: boolean;
  }>;
}
export interface AssistantToolRegistry {
  tools(context?: ToolContext): AssistantTool[];
}
