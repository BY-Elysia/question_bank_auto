import type { Answer } from './answer.js';
import type { ChoiceOption } from './choice-option.js';
import type { RubricItem } from './rubric-item.js';
import type { SourceEvidence } from '../../assets/domain/source-evidence.js';
import type { TextBlock } from './text-block.js';

/** ChoiceQuestion contract. */
export type ChoiceQuestion = {
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
  kind: 'choice';
  /** @enum {string} */
  selectionMode: 'single' | 'multiple';
  options: ChoiceOption[];
  correctOptionIds: string[];
  allowPartial: boolean;
};
