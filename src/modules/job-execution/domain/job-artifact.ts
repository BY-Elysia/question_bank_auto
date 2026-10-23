/** id 同时预留为正式 Asset ID。产物字节先写入不可变暂存，complete 只登记同 ID 的资产引用；未提交的孤立字节稍后回收。 */
export type JobArtifact = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  jobId: string;
  /** Format: uuid */
  stepId: string;
  /** @enum {string} */
  kind: 'page' | 'crop' | 'candidate' | 'model_response' | 'log' | 'export';
  sha256: string;
  sizeBytes: number;
  /** Format: date-time */
  createdAt: string;
};
