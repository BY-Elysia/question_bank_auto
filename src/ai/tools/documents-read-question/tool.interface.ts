import type { ReadQuestionInput } from './contracts/read-question-input.js';
import type { LibraryQuestion } from '../../../modules/library/domain/library-question.js';
import type { ToolExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface DocumentsReadQuestionTool {
  readonly id: 'documents.read-question';
  execute(input: ReadQuestionInput, context: ToolExecutionContext): Promise<LibraryQuestion>;
}
