import type { TextbookExtractionRequest } from './contracts/textbook-extraction-request.js';
import type { JobResult } from '../../../modules/jobs/domain/job-result.js';
import type { WorkflowExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface TextbookExtractionWorkflow {
  readonly id: 'textbook-extraction';
  execute(input: TextbookExtractionRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
