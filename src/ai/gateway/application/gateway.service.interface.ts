import type { InvokeModelInput, InvokeModelResult } from './commands/invoke-model.command.js';
import type { ExecuteToolInput, ExecuteToolResult } from './commands/execute-tool.command.js';

export const GATEWAY_SERVICE = Symbol('GATEWAY_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface GatewayService {
  invokeModel(input: InvokeModelInput): Promise<InvokeModelResult>;
  executeTool(input: ExecuteToolInput): Promise<ExecuteToolResult>;
}
