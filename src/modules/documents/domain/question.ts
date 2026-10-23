import type { ChoiceQuestion } from './choice-question.js';
import type { FreeResponseQuestion } from './free-response-question.js';
import type { GroupQuestion } from './group-question.js';

/** Question contract. */
export type Question = ChoiceQuestion | FreeResponseQuestion | GroupQuestion;
