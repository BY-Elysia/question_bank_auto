import type { WorkflowRequest } from '../../../../ai/workflows/contracts/workflow-request.js';

/** 包含模型步骤时必须指定已配置的 aiConfigurationRevision；纯转图、导入、组卷、导出无需该字段。 */
export type JobCreate = {
  request: WorkflowRequest;
  aiConfigurationRevision?: number;
} & unknown;
