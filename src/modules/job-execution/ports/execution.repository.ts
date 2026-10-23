import type { WorkerScope } from '../../../shared/contracts/identity-context.js';
import type { Lease } from '../domain/lease.js';
import type { Checkpoint } from '../domain/checkpoint.js';
import type { StepCommit } from '../application/dto/step-commit.js';
import type { JobComplete } from '../application/dto/job-complete.js';
import type { Job } from '../../jobs/domain/job.js';

export const EXECUTION_REPOSITORY = Symbol('EXECUTION_REPOSITORY');

export interface ExecutionRepository {
  claim(scope: WorkerScope, jobId: string): Promise<Lease>;
  /** Validates fencing token; result, checkpoint and events commit together. */
  commitStep(scope: WorkerScope, jobId: string, command: StepCommit): Promise<Checkpoint>;
  complete(scope: WorkerScope, jobId: string, command: JobComplete): Promise<Job>;
}
