import type { ModelInvalidResponse } from './model-invalid-response.js';
import type { ModelStructuredResponse } from './model-structured-response.js';
import type { ModelToolsResponse } from './model-tools-response.js';

/** ModelInvocationResponse contract. */
export type ModelInvocationResponse =
  ModelStructuredResponse | ModelToolsResponse | ModelInvalidResponse;
