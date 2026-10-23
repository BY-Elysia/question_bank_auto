import type { CreateJobInput, CreateJobResult } from './commands/create-job.command.js';
import type { ListJobsInput, ListJobsResult } from './commands/list-jobs.command.js';
import type { GetJobInput, GetJobResult } from './commands/get-job.command.js';
import type { CancelJobInput, CancelJobResult } from './commands/cancel-job.command.js';
import type { RetryJobInput, RetryJobResult } from './commands/retry-job.command.js';
import type { ListJobStepsInput, ListJobStepsResult } from './commands/list-job-steps.command.js';
import type {
  ListJobEventsInput,
  ListJobEventsResult,
} from './commands/list-job-events.command.js';
import type {
  StreamJobEventsInput,
  StreamJobEventsResult,
} from './commands/stream-job-events.command.js';
import type {
  ListJobInvocationsInput,
  ListJobInvocationsResult,
} from './commands/list-job-invocations.command.js';

export const JOBS_SERVICE = Symbol('JOBS_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface JobsService {
  createJob(input: CreateJobInput): Promise<CreateJobResult>;
  listJobs(input: ListJobsInput): Promise<ListJobsResult>;
  getJob(input: GetJobInput): Promise<GetJobResult>;
  cancelJob(input: CancelJobInput): Promise<CancelJobResult>;
  retryJob(input: RetryJobInput): Promise<RetryJobResult>;
  listJobSteps(input: ListJobStepsInput): Promise<ListJobStepsResult>;
  listJobEvents(input: ListJobEventsInput): Promise<ListJobEventsResult>;
  streamJobEvents(input: StreamJobEventsInput): Promise<StreamJobEventsResult>;
  listJobInvocations(input: ListJobInvocationsInput): Promise<ListJobInvocationsResult>;
}
