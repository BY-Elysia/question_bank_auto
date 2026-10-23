import type { SkillId } from './skill-id.js';
import type { WorkflowId } from './workflow-id.js';

/** WorkflowDefinition contract. */
export type WorkflowDefinition = {
  id: WorkflowId;
  version: string;
  description: string;
  skills: SkillId[];
  inputSchemaRef: string;
  /** @enum {string} */
  status: 'planned' | 'active' | 'deprecated';
};
