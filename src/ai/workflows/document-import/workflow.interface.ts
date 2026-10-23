import type { DocumentImportRequest } from './contracts/document-import-request.js';
import type { JobResult } from '../../../modules/jobs/domain/job-result.js';
import type { WorkflowExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface DocumentImportWorkflow {
  readonly id: 'document-import';
  execute(input: DocumentImportRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
