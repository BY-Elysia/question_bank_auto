import type { ToolId } from './tool-id.js';

/** ToolDefinition contract. */
export type ToolDefinition = {
  id: ToolId;
  version: string;
  description: string;
  /** @enum {string} */
  sideEffect: 'none' | 'create_job_artifact';
  inputSchemaRef: string;
  outputSchemaRef: string;
  requiredScopes: string[];
};
