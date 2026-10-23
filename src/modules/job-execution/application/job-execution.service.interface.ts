import type { ClaimJobInput, ClaimJobResult } from './commands/claim-job.command.js';
import type { HeartbeatJobInput, HeartbeatJobResult } from './commands/heartbeat-job.command.js';
import type {
  UploadJobArtifactInput,
  UploadJobArtifactResult,
} from './commands/upload-job-artifact.command.js';
import type {
  CommitJobStepInput,
  CommitJobStepResult,
} from './commands/commit-job-step.command.js';
import type { CompleteJobInput, CompleteJobResult } from './commands/complete-job.command.js';
import type {
  ReadJobArtifactContentInput,
  ReadJobArtifactContentResult,
} from './commands/read-job-artifact-content.command.js';

export const JOB_EXECUTION_SERVICE = Symbol('JOB_EXECUTION_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface JobExecutionService {
  claimJob(input: ClaimJobInput): Promise<ClaimJobResult>;
  heartbeatJob(input: HeartbeatJobInput): Promise<HeartbeatJobResult>;
  uploadJobArtifact(input: UploadJobArtifactInput): Promise<UploadJobArtifactResult>;
  commitJobStep(input: CommitJobStepInput): Promise<CommitJobStepResult>;
  completeJob(input: CompleteJobInput): Promise<CompleteJobResult>;
  readJobArtifactContent(input: ReadJobArtifactContentInput): Promise<ReadJobArtifactContentResult>;
}
