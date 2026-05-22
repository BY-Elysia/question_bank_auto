import type {
  AnswerHandlingMode,
  DocumentType,
  TextbookJsonPayload,
} from '../../types'

export function resolveAnswerHandlingMode(
  value: boolean | AnswerHandlingMode | undefined,
  fallback: AnswerHandlingMode = 'extract_visible',
): AnswerHandlingMode {
  if (value === 'extract_visible' || value === 'leave_empty' || value === 'generate_brief') {
    return value
  }
  if (typeof value === 'boolean') {
    return value ? 'extract_visible' : 'leave_empty'
  }
  return fallback
}

export function getPayloadDocumentType(payload: unknown): DocumentType {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  if (String(data.documentType || '').trim().toLowerCase() === 'exam') {
    return 'exam'
  }
  if (data.exam && typeof data.exam === 'object') {
    return 'exam'
  }
  return 'textbook'
}

export function getPayloadSourceMeta(payload: TextbookJsonPayload) {
  const documentType = getPayloadDocumentType(payload)
  if (documentType === 'exam') {
    const exam = payload.exam && typeof payload.exam === 'object' ? payload.exam : null
    return {
      documentType,
      externalId: String(exam?.examId || '').trim(),
      title: String(exam?.title || '').trim(),
      subject: String(exam?.subject || '').trim(),
      publisher: '',
      examType: String(exam?.examType || '').trim(),
      hasAnswer: exam?.hasAnswer !== false,
      answerHandlingMode: resolveAnswerHandlingMode(
        exam && typeof exam === 'object'
          ? (exam as Record<string, unknown>).answerHandlingMode as AnswerHandlingMode | undefined
          : undefined,
        exam?.hasAnswer !== false ? 'extract_visible' : 'leave_empty',
      ),
      rawMeta: exam,
    }
  }

  const textbook = payload.textbook && typeof payload.textbook === 'object' ? payload.textbook : null
  return {
    documentType,
    externalId: String(textbook?.textbookId || '').trim(),
    title: String(textbook?.title || '').trim(),
    subject: String(textbook?.subject || '').trim(),
    publisher: String(textbook?.publisher || '').trim(),
    examType: '',
    hasAnswer: textbook?.hasAnswer !== false,
    answerHandlingMode: resolveAnswerHandlingMode(
      textbook && typeof textbook === 'object'
        ? (textbook as Record<string, unknown>).answerHandlingMode as AnswerHandlingMode | undefined
        : undefined,
      textbook?.hasAnswer !== false ? 'extract_visible' : 'generate_brief',
    ),
    rawMeta: textbook,
  }
}

export function getPayloadAnswerHandlingMode(payload: TextbookJsonPayload): AnswerHandlingMode {
  const sourceMeta = getPayloadSourceMeta(payload)
  return sourceMeta.answerHandlingMode
}

export function payloadExpectsAnswer(payload: TextbookJsonPayload) {
  return getPayloadAnswerHandlingMode(payload) !== 'leave_empty'
}

export function isValidTextbookPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return false
  const data = payload as Record<string, unknown>
  if (typeof data.version !== 'string' || !data.version.trim()) return false
  if (typeof data.courseId !== 'string' || !data.courseId.trim()) return false
  const documentType = getPayloadDocumentType(data)
  if (documentType === 'exam') {
    if (!data.exam || typeof data.exam !== 'object') return false
    const exam = data.exam as Record<string, unknown>
    if (typeof exam.examId !== 'string' || !exam.examId.trim()) return false
    if (typeof exam.title !== 'string') return false
    if (typeof exam.subject !== 'string') return false
    if (!['quiz', 'midterm', 'final'].includes(String(exam.examType || '').trim())) return false
    if (typeof exam.hasAnswer !== 'boolean') return false
    if (
      exam.answerHandlingMode !== undefined &&
      !['extract_visible', 'leave_empty', 'generate_brief'].includes(String(exam.answerHandlingMode || '').trim())
    ) {
      return false
    }
  } else {
    if (!data.textbook || typeof data.textbook !== 'object') return false
    const textbook = data.textbook as Record<string, unknown>
    if (typeof textbook.textbookId !== 'string' || !textbook.textbookId.trim()) return false
    if (typeof textbook.title !== 'string') return false
    if (typeof textbook.publisher !== 'string') return false
    if (typeof textbook.subject !== 'string') return false
    if (textbook.hasAnswer !== undefined && typeof textbook.hasAnswer !== 'boolean') return false
    if (
      textbook.answerHandlingMode !== undefined &&
      !['extract_visible', 'leave_empty', 'generate_brief'].includes(String(textbook.answerHandlingMode || '').trim())
    ) {
      return false
    }
  }
  if (!Array.isArray(data.chapters)) return false
  if (!Array.isArray(data.questions)) return false
  return true
}
