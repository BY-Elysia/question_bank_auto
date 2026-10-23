import type { ExamExtractionRequest } from './contracts/exam-extraction-request.js';
import type { JobResult } from '../../../modules/jobs/domain/job-result.js';
import type { WorkflowExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface ExamExtractionWorkflow {
  readonly id: 'exam-extraction';
  execute(input: ExamExtractionRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
