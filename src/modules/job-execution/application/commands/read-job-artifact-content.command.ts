import type { ArtifactReadRequest } from '../dto/artifact-read-request.js';
import type { DownloadContent } from '../../../../shared/contracts/transport.js';

/** 读取当前任务的暂存产物. Runtime validation is not implemented yet. */
export interface ReadJobArtifactContentInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: ArtifactReadRequest;
}

export type ReadJobArtifactContentResult = DownloadContent;
