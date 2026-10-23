import type { ToolCall } from '../../runtime/contracts/tool-call.js';

/** RequestedToolCall contract. */
export type RequestedToolCall = {
  id: string;
  call: ToolCall;
};
