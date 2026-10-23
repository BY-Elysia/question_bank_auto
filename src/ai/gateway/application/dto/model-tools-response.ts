import type { RequestedToolCall } from '../../domain/requested-tool-call.js';
import type { Usage } from '../../../../modules/model-config/domain/usage.js';

/** ModelToolsResponse contract. */
export type ModelToolsResponse = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'tool_calls';
  /** Format: uuid */
  invocationId: string;
  calls: RequestedToolCall[];
  usage: Usage;
};
