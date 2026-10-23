import type { ExamContent } from './exam-content.js';
import type { TextbookContent } from './textbook-content.js';

/** DocumentContent contract. */
export type DocumentContent = TextbookContent | ExamContent;
