import type { TextBlock } from '../../../../modules/documents/domain/text-block.js';

/** GeneratedAnswer contract. */
export type GeneratedAnswer = {
  /** @enum {string} */
  origin: 'generated';
  content: TextBlock;
  explanation?: string;
  /** Format: uuid */
  generationInvocationId?: string;
};
