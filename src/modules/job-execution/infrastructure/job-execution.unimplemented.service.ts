import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { JobExecutionService } from '../application/job-execution.service.interface.js';
import type { ClaimJobInput, ClaimJobResult } from '../application/commands/claim-job.command.js';
import type {
  HeartbeatJobInput,
  HeartbeatJobResult,
} from '../application/commands/heartbeat-job.command.js';
import type {
  UploadJobArtifactInput,
  UploadJobArtifactResult,
} from '../application/commands/upload-job-artifact.command.js';
import type {
  CommitJobStepInput,
  CommitJobStepResult,
} from '../application/commands/commit-job-step.command.js';
import type {
  CompleteJobInput,
  CompleteJobResult,
} from '../application/commands/complete-job.command.js';
import type {
  ReadJobArtifactContentInput,
  ReadJobArtifactContentResult,
} from '../application/commands/read-job-artifact-content.command.js';

@Injectable()
export class JobExecutionUnimplementedService implements JobExecutionService {
  async claimJob(_input: ClaimJobInput): Promise<ClaimJobResult> {
    throw new OperationNotImplemented('claimJob');
  }

  async heartbeatJob(_input: HeartbeatJobInput): Promise<HeartbeatJobResult> {
    throw new OperationNotImplemented('heartbeatJob');
  }

  async uploadJobArtifact(_input: UploadJobArtifactInput): Promise<UploadJobArtifactResult> {
    throw new OperationNotImplemented('uploadJobArtifact');
  }

  async commitJobStep(_input: CommitJobStepInput): Promise<CommitJobStepResult> {
    throw new OperationNotImplemented('commitJobStep');
  }

  async completeJob(_input: CompleteJobInput): Promise<CompleteJobResult> {
    throw new OperationNotImplemented('completeJob');
  }

  async readJobArtifactContent(
    _input: ReadJobArtifactContentInput,
  ): Promise<ReadJobArtifactContentResult> {
    throw new OperationNotImplemented('readJobArtifactContent');
  }
}
