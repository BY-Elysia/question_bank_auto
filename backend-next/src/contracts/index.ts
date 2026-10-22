/** Type-only API facade. The OpenAPI document is the source of truth. */
import type { components, operations } from './api.js';

export type { components, operations, paths } from './api.js';
export type Document = components['schemas']['Document'];
export type DocumentContent = components['schemas']['DocumentContent'];
export type Question = components['schemas']['Question'];
export type Job = components['schemas']['Job'];
export type JobCreate = components['schemas']['JobCreate'];
export type JobEvent = components['schemas']['JobEvent'];
export type SkillInput = components['schemas']['SkillInput'];
export type SkillOutput = components['schemas']['SkillOutput'];
export type ToolCall = components['schemas']['ToolCall'];
export type ToolResult = components['schemas']['ToolResult'];
export type Problem = components['schemas']['Problem'];

export type CreateJobBody = operations['createJob']['requestBody']['content']['application/json'];
