import type { LibrarySearchRequest } from './contracts/library-search-request.js';
import type { JobResult } from '../../../modules/jobs/domain/job-result.js';
import type { WorkflowExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface LibrarySearchWorkflow {
  readonly id: 'library-search';
  execute(input: LibrarySearchRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
