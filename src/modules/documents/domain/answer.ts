import type { TextBlock } from './text-block.js';

/** Answer contract. */
export type Answer = {
  /** @enum {string} */
  origin: 'source' | 'generated' | 'human' | 'none';
  content: TextBlock;
  explanation?: string;
  /** Format: uuid */
  generationInvocationId?: string;
};
