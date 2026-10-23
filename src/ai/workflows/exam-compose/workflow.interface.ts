import type { ExamComposeRequest } from './contracts/exam-compose-request.js';
import type { JobResult } from '../../../modules/jobs/domain/job-result.js';
import type { WorkflowExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface ExamComposeWorkflow {
  readonly id: 'exam-compose';
  execute(input: ExamComposeRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
