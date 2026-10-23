import type { ModelCapabilities } from '../../../modules/model-config/domain/model-capabilities.js';
import type { ModelRole } from '../../../modules/model-config/domain/model-role.js';
import type { SkillId } from './skill-id.js';
import type { ToolId } from './tool-id.js';

/** SkillDefinition contract. */
export type SkillDefinition = {
  id: SkillId;
  version: string;
  description: string;
  /** @enum {string} */
  mode: 'single-call' | 'tool-loop';
  modelRole: ModelRole;
  inputSchemaRef: string;
  outputSchemaRef: string;
  allowedTools: ToolId[];
  maxModelCalls: number;
  maxToolCalls: number;
  /** @enum {string} */
  status: 'planned' | 'active' | 'deprecated';
  requiredCapabilities: ModelCapabilities;
};
