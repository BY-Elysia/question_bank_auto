import type {
  ChapterSessionState,
  ExamQuestionSessionState,
  ExamSessionState,
  QuestionSessionState,
} from './types'

export const chapterSessions = new Map<string, ChapterSessionState>()
export const questionSessions = new Map<string, QuestionSessionState>()
export const examSessions = new Map<string, ExamSessionState>()
export const examQuestionSessions = new Map<string, ExamQuestionSessionState>()
