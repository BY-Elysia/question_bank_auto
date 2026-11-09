import type { QuestionAddress } from '../../catalog/domain/catalog.js';
import type { Change } from '../domain/change.js';
import type { Job } from '../../jobs/domain/job.js';
export interface QuestionOperationContext {
  target: QuestionAddress;
  principalId: string;
  runId: string;
  commandId?: string;
}
export interface QuestionTask {
  workspaceId: string;
  jobId: string;
}
export interface QuestionOperationResult {
  status: 'failed' | 'applied' | 'unchanged';
  changes: { id: string; revision: number }[];
  jobId?: string;
  error?: string;
  issues?: Job['issues'];
}
/** Authorized callers supply an immutable target; authorization is rechecked before committing. */
export interface QuestionOperations {
  start(
    context: QuestionOperationContext,
    kind: 'repair' | 'answers',
    instruction: string,
  ): Promise<QuestionTask>;
  cancel(context: QuestionOperationContext): Promise<void>;
  settle(
    context: QuestionOperationContext,
    task: QuestionTask,
    signal: AbortSignal,
    authorize: () => Promise<void>,
  ): Promise<QuestionOperationResult>;
  list(context: QuestionOperationContext): Promise<Change[]>;
  undo(context: QuestionOperationContext, id: string): Promise<{ id: string; undone: true }>;
}
