import type { ReadPageInput } from './contracts/read-page-input.js';
import type { ReadPageOutput } from './contracts/read-page-output.js';
import type { ToolExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface AssetsReadPageTool {
  readonly id: 'assets.read-page';
  execute(input: ReadPageInput, context: ToolExecutionContext): Promise<ReadPageOutput>;
}
