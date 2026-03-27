export type ChapterItem = {
  chapterId: string
  parentId: string | null
  title: string
  orderNo: number
}

export type DocumentType = 'textbook' | 'exam'

export type AnswerHandlingMode = 'extract_visible' | 'leave_empty' | 'generate_brief'

export type TextbookMeta = {
  textbookId: string
  title: string
  publisher: string
  subject: string
  hasAnswer?: boolean
}

export type ExamType = 'quiz' | 'midterm' | 'final'

export type ExamMeta = {
  examId: string
  title: string
  subject: string
  examType: ExamType
  hasAnswer: boolean
}

export type TextbookJsonPayload = {
  version: string
  courseId: string
  documentType?: DocumentType
  textbook?: TextbookMeta
  exam?: ExamMeta
  chapters: ChapterItem[]
  questions: unknown[]
  [key: string]: unknown
}

export type ChapterSessionState = {
  sessionId: string
  jsonFilePath: string
  currentChapterTitle: string
  currentSectionTitle: string
  updatedAt: string
}

export type ExamSessionState = {
  sessionId: string
  jsonFilePath: string
  examTitle: string
  examType: ExamType
  hasAnswer: boolean
  currentMajorTitle: string
  currentMinorTitle: string
  updatedAt: string
}

export type ChapterDetectResult = {
  chapterTitle: string | null
  sectionTitle: string | null
  switchSectionTitle: string | null
  needReprocessSameImage: boolean
  reason: string
}

export type ExamStructureDetectResult = {
  majorTitle: string | null
  minorTitle: string | null
  needReprocessSameImage: boolean
  reason: string
}

export type QuestionTextBlock = {
  text: string
  media: Array<Record<string, unknown>>
}

export type QuestionRubricItem = {
  rubricItemKey: string
  maxScore: number
  criteria: string
}

export type QuestionLeaf = {
  questionId: string
  chapterId: string
  nodeType: 'LEAF'
  questionType: string
  title: string
  prompt: QuestionTextBlock
  standardAnswer: QuestionTextBlock
  defaultScore: number
  rubric: QuestionRubricItem[]
}

export type QuestionGroupChild = {
  questionId: string
  title: string
  orderNo: number
  questionType: string
  chapterId: string
  prompt: QuestionTextBlock
  standardAnswer: QuestionTextBlock
  defaultScore: number
  rubric: QuestionRubricItem[]
}

export type QuestionGroup = {
  questionId: string
  chapterId: string
  nodeType: 'GROUP'
  questionType: string
  title: string
  stem: QuestionTextBlock
  children: QuestionGroupChild[]
}

export type QuestionItem = QuestionLeaf | QuestionGroup

export type QuestionSessionState = {
  sessionId: string
  jsonFilePath: string
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  pendingPageDataUrls: string[]
  pendingPageLabels: string[]
  pendingContinueQuestionKey: string | null
  processingStartQuestionKey: string | null
  pendingReason: string | null
  pendingUpsertedCount: number
  updatedAt: string
}

export type ExamQuestionSessionState = {
  sessionId: string
  jsonFilePath: string
  examTitle: string
  examType: ExamType
  hasAnswer: boolean
  currentMajorTitle: string
  currentMinorTitle: string
  currentStructureChapterId: string
  pendingPageDataUrls: string[]
  pendingPageLabels: string[]
  pendingContinueQuestionKey: string | null
  processingStartQuestionKey: string | null
  pendingReason: string | null
  pendingUpsertedCount: number
  updatedAt: string
}

export type QuestionExtractResult = {
  questionsToUpsert: unknown[]
  needNextPage: boolean
  continueQuestionKey: string | null
  reason: string
  rawText: string
}

export type CombinedExtractResult = {
  chapter: ChapterDetectResult
  question: QuestionExtractResult
}

export type ExamCombinedExtractResult = {
  structure: ExamStructureDetectResult
  question: QuestionExtractResult
}

export type QuestionBoundaryResult = {
  needNextPage: boolean
  continueQuestionKey: string | null
  hasExtractableQuestions: boolean
  reason: string
  rawText: string
}

export type LastQuestionLookaheadResult = {
  continueQuestionKey: string | null
  reason: string
  rawText: string
}

export type RangeMismatchCheckResult = {
  shouldRetry: boolean
  reason: string
}
