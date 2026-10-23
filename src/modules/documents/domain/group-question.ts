import type { LeafQuestion } from './leaf-question.js';
import type { SourceEvidence } from '../../assets/domain/source-evidence.js';
import type { TextBlock } from './text-block.js';

/** GroupQuestion contract. */
export type GroupQuestion = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  nodeId: string;
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'group';
  title: string;
  stem: TextBlock;
  children: LeafQuestion[];
  evidence: SourceEvidence[];
};
