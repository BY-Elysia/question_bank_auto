import type { Question } from './question.js';
import type { StructureNode } from './structure-node.js';

/** ExamContent contract. */
export type ExamContent = {
  /** @enum {string} */
  schemaVersion: '1.0';
  title: string;
  subject: string;
  courseId: string;
  /** @enum {string} */
  answerMode: 'extract_visible' | 'leave_empty' | 'generate';
  nodes: StructureNode[];
  questions: Question[];
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'exam';
  /** @enum {string} */
  examType: 'quiz' | 'midterm' | 'final' | 'practice';
  durationMinutes: number | null;
};
