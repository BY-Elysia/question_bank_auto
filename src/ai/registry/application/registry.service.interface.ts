import type { ListSkillsInput, ListSkillsResult } from './commands/list-skills.command.js';
import type { ListToolsInput, ListToolsResult } from './commands/list-tools.command.js';
import type { ListWorkflowsInput, ListWorkflowsResult } from './commands/list-workflows.command.js';

export const REGISTRY_SERVICE = Symbol('REGISTRY_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface RegistryService {
  listSkills(input: ListSkillsInput): Promise<ListSkillsResult>;
  listTools(input: ListToolsInput): Promise<ListToolsResult>;
  listWorkflows(input: ListWorkflowsInput): Promise<ListWorkflowsResult>;
}
