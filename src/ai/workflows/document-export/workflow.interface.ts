import type { DocumentExportRequest } from './contracts/document-export-request.js';
import type { JobResult } from '../../../modules/jobs/domain/job-result.js';
import type { WorkflowExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface DocumentExportWorkflow {
  readonly id: 'document-export';
  execute(input: DocumentExportRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
