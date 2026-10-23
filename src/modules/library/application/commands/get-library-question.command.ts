import type { LibraryQuestion } from '../../domain/library-question.js';

/** 读取不可变题目版本. Runtime validation is not implemented yet. */
export interface GetLibraryQuestionInput {
  path: {
    questionVersionId: string;
  };
}

export type GetLibraryQuestionResult = LibraryQuestion;
