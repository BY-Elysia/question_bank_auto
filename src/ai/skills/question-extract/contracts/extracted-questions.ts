import type { CropBox } from '../../../../modules/assets/domain/crop-box.js';
import type { Question } from '../../../../modules/documents/domain/question.js';

/** ExtractedQuestions contract. */
export type ExtractedQuestions = {
  questions: Question[];
  cropSuggestions: {
    /** Format: uuid */
    sourceAssetId: string;
    region: CropBox;
    /** Format: uuid */
    questionId: string;
    /** @enum {string} */
    target: 'prompt' | 'answer' | 'stem';
  }[];
};
