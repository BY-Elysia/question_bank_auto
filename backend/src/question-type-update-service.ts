import { resolveQuestionTarget } from './question-json-target'
import {
  QUESTION_TYPE_OPTIONS,
  loadTextbookJson,
  normalizeQuestionType,
  saveTextbookJson,
} from './question-bank-service'

function getQuestionTypeMeta(questionTypeInput: string) {
  const questionType = normalizeQuestionType(questionTypeInput)
  const meta = QUESTION_TYPE_OPTIONS.find((item) => item.value === questionType)
  if (!meta) {
    throw new Error(`questionType is unsupported: ${questionTypeInput}`)
  }
  return meta
}

export async function updateQuestionTypeInTextbookJson(params: {
  jsonFilePath: string
  sourceFileName?: string
  questionId: string
  questionType: string
  childQuestionId?: string
  childNo?: number | null
}) {
  const {
    jsonFilePath,
    sourceFileName = '',
    questionId,
    questionType,
    childQuestionId = '',
    childNo = null,
  } = params

  const normalizedQuestionId = String(questionId || '').trim()
  if (!normalizedQuestionId) {
    throw new Error('questionId is required')
  }

  const typeMeta = getQuestionTypeMeta(questionType)
  const payload = await loadTextbookJson(jsonFilePath)
  const target = resolveQuestionTarget({
    payload,
    questionId: normalizedQuestionId,
    childQuestionId,
    childNo,
  })

  if (target.childNode) {
    target.childNode.questionType = typeMeta.value
  } else {
    target.questionNode.questionType = typeMeta.value
  }

  await saveTextbookJson(jsonFilePath, payload)

  return {
    message: 'success',
    jsonFilePath,
    chapterTitle: target.chapterTitle,
    sectionTitle: target.sectionTitle,
    questionId: target.questionId,
    childQuestionId: target.childQuestionId,
    questionTitle: target.questionTitle,
    questionType: typeMeta.value,
    questionTypeLabel: typeMeta.label,
    targetLabel: target.childNode ? '小题题型' : '题目题型',
    question: target.questionNode,
  }
}
