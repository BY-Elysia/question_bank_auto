import type { WorkflowRequest } from '../workflows/contracts/workflow-request.js';
import type { WorkflowExecutionContext } from './execution-context.js';
import type { JobResult } from '../../modules/jobs/domain/job-result.js';

export const WORKFLOW_RUNNER = Symbol('WORKFLOW_RUNNER');

export interface WorkflowRunner {
  execute(request: WorkflowRequest, context: WorkflowExecutionContext): Promise<JobResult>;
}
