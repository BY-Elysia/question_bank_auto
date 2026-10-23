import type { LibrarySearchInput } from './contracts/library-search-input.js';
import type { LibrarySearchOutput } from './contracts/library-search-output.js';
import type { SkillExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface QuestionBankSearchSkill {
  readonly id: 'question-bank-search';
  execute(input: LibrarySearchInput, context: SkillExecutionContext): Promise<LibrarySearchOutput>;
}
