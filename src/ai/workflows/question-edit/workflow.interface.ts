import type { QuestionEditRequest } from './contracts/question-edit-request.js';
import type { JobResult } from '../../../modules/jobs/domain/job-result.js';
import type { WorkflowExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface QuestionEditWorkflow {
  readonly id: 'question-edit';
  execute(input: QuestionEditRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
