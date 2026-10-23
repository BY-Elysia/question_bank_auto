import type { LibraryQuery } from '../../../modules/library/application/dto/library-query.js';
import type { QuestionPage } from '../../../modules/library/application/dto/question-page.js';
import type { ToolExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface LibrarySearchQuestionsTool {
  readonly id: 'library.search-questions';
  execute(input: LibraryQuery, context: ToolExecutionContext): Promise<QuestionPage>;
}
