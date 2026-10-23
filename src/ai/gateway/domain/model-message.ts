import type { ModelPart } from './model-part.js';

/** ModelMessage contract. */
export type ModelMessage = {
  /** @enum {string} */
  role: 'system' | 'user' | 'assistant' | 'tool';
  parts: ModelPart[];
  toolCallId?: string;
};
