import type { WorkflowCatalog } from '../dto/workflow-catalog.js';

/** 列出工作流定义. Runtime validation is not implemented yet. */
export interface ListWorkflowsInput {}

export type ListWorkflowsResult = WorkflowCatalog;
