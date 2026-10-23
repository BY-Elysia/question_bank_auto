import type { ListNodesInput } from './contracts/list-nodes-input.js';
import type { NodePage } from '../../../modules/library/application/dto/node-page.js';
import type { ToolExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface LibraryListNodesTool {
  readonly id: 'library.list-nodes';
  execute(input: ListNodesInput, context: ToolExecutionContext): Promise<NodePage>;
}
