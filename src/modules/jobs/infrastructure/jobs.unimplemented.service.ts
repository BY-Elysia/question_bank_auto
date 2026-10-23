import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { JobsService } from '../application/jobs.service.interface.js';
import type {
  CreateJobInput,
  CreateJobResult,
} from '../application/commands/create-job.command.js';
import type { ListJobsInput, ListJobsResult } from '../application/commands/list-jobs.command.js';
import type { GetJobInput, GetJobResult } from '../application/commands/get-job.command.js';
import type {
  CancelJobInput,
  CancelJobResult,
} from '../application/commands/cancel-job.command.js';
import type { RetryJobInput, RetryJobResult } from '../application/commands/retry-job.command.js';
import type {
  ListJobStepsInput,
  ListJobStepsResult,
} from '../application/commands/list-job-steps.command.js';
import type {
  ListJobEventsInput,
  ListJobEventsResult,
} from '../application/commands/list-job-events.command.js';
import type {
  StreamJobEventsInput,
  StreamJobEventsResult,
} from '../application/commands/stream-job-events.command.js';
import type {
  ListJobInvocationsInput,
  ListJobInvocationsResult,
} from '../application/commands/list-job-invocations.command.js';

@Injectable()
export class JobsUnimplementedService implements JobsService {
  async createJob(_input: CreateJobInput): Promise<CreateJobResult> {
    throw new OperationNotImplemented('createJob');
  }

  async listJobs(_input: ListJobsInput): Promise<ListJobsResult> {
    throw new OperationNotImplemented('listJobs');
  }

  async getJob(_input: GetJobInput): Promise<GetJobResult> {
    throw new OperationNotImplemented('getJob');
  }

  async cancelJob(_input: CancelJobInput): Promise<CancelJobResult> {
    throw new OperationNotImplemented('cancelJob');
  }

  async retryJob(_input: RetryJobInput): Promise<RetryJobResult> {
    throw new OperationNotImplemented('retryJob');
  }

  async listJobSteps(_input: ListJobStepsInput): Promise<ListJobStepsResult> {
    throw new OperationNotImplemented('listJobSteps');
  }

  async listJobEvents(_input: ListJobEventsInput): Promise<ListJobEventsResult> {
    throw new OperationNotImplemented('listJobEvents');
  }

  async streamJobEvents(_input: StreamJobEventsInput): Promise<StreamJobEventsResult> {
    throw new OperationNotImplemented('streamJobEvents');
  }

  async listJobInvocations(_input: ListJobInvocationsInput): Promise<ListJobInvocationsResult> {
    throw new OperationNotImplemented('listJobInvocations');
  }
}
