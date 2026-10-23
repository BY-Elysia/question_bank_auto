import type { WorkflowDefinition } from '../../../runtime/contracts/workflow-definition.js';

/** WorkflowCatalog contract. */
export type WorkflowCatalog = {
  items: WorkflowDefinition[];
};
