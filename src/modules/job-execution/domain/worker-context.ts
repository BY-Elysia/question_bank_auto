import type { Checkpoint } from './checkpoint.js';
import type { DocumentRevision } from '../../documents/domain/document-revision.js';
import type { WorkerAsset } from './worker-asset.js';

/** document 为冻结的 baseRevision 快照；assets 仅包含当前任务获授权的输入。用于 Worker 本地文件定位。 */
export type WorkerContext = {
  document: DocumentRevision | null;
  assets: WorkerAsset[];
  checkpoint: Checkpoint | null;
};
