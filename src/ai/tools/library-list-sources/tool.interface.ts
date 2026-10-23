import type { ListSourcesInput } from './contracts/list-sources-input.js';
import type { PublicationPage } from '../../../modules/library/application/dto/publication-page.js';
import type { ToolExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface LibraryListSourcesTool {
  readonly id: 'library.list-sources';
  execute(input: ListSourcesInput, context: ToolExecutionContext): Promise<PublicationPage>;
}
