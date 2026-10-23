import type { ChoiceQuestion } from './choice-question.js';
import type { FreeResponseQuestion } from './free-response-question.js';

/** LeafQuestion contract. */
export type LeafQuestion = ChoiceQuestion | FreeResponseQuestion;
