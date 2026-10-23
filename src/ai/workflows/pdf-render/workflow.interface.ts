import type { PdfRenderRequest } from './contracts/pdf-render-request.js';
import type { JobResult } from '../../../modules/jobs/domain/job-result.js';
import type { WorkflowExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface PdfRenderWorkflow {
  readonly id: 'pdf-render';
  execute(input: PdfRenderRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
