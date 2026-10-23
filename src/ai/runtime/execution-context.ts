import type { WorkerScope } from '../../shared/contracts/identity-context.js';
import type { LeaseContext } from '../../modules/job-execution/domain/lease-context.js';
import type { ExecutionPlan } from '../../modules/jobs/domain/execution-plan.js';

export interface WorkflowExecutionContext {
  scope: WorkerScope;
  jobId: string;
  lease: LeaseContext;
  plan: ExecutionPlan;
  signal: AbortSignal;
}

export interface SkillExecutionContext extends WorkflowExecutionContext {
  stepId: string;
  attempt: number;
}

export interface ToolExecutionContext extends SkillExecutionContext {
  invocationId: string;
  toolCallId: string;
}
