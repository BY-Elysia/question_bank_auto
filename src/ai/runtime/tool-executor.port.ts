import type { ToolCall } from './contracts/tool-call.js';
import type { ToolResult } from './contracts/tool-result.js';
import type { ToolExecutionContext } from './execution-context.js';

export const TOOL_EXECUTOR = Symbol('TOOL_EXECUTOR');

export interface ToolExecutor {
  execute<K extends ToolCall['toolId']>(
    call: Extract<ToolCall, { toolId: K }>,
    context: ToolExecutionContext,
  ): Promise<Extract<ToolResult, { toolId: K }>>;
}
