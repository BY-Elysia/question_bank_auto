import type { Answer } from './answer.js';
import type { RubricItem } from './rubric-item.js';
import type { SourceEvidence } from '../../assets/domain/source-evidence.js';
import type { TextBlock } from './text-block.js';

/** FreeResponseQuestion contract. */
export type FreeResponseQuestion = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  nodeId: string;
  title: string;
  prompt: TextBlock;
  answer: Answer;
  score: number;
  rubric: RubricItem[];
  evidence: SourceEvidence[];
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'free_response';
  /** @enum {string} */
  responseType: 'fill_blank' | 'short_answer' | 'proof' | 'calculation' | 'code' | 'other';
};
