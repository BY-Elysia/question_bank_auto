import type { ArtifactUpload } from '../dto/artifact-upload.js';
import type { JobArtifact } from '../../domain/job-artifact.js';

/** 上传任务产物并登记暂存引用. Runtime validation is not implemented yet. */
export interface UploadJobArtifactInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: ArtifactUpload;
}

export type UploadJobArtifactResult = JobArtifact;
