import fsp from 'node:fs/promises'
import path from 'node:path'
import { REPAIR_JSON_DIR } from './config'
import { resolveQuestionTarget } from './question-json-target'
import {
  QUESTION_TYPE_OPTIONS,
  loadTextbookJson,
  normalizeJsonFileName,
  normalizeQuestionType,
  sanitizeFileName,
  saveTextbookJson,
} from './question-bank-service'

function buildRepairJsonFileName(sourceFileName: string, jsonFilePath: string) {
  const preferred = String(sourceFileName || '').trim()
  if (preferred) {
    const base = path.basename(preferred).replace(/[\\/:*?"<>|]/g, '_')
    return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
  }
  return normalizeJsonFileName(path.basename(jsonFilePath))
}

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

  await fsp.mkdir(REPAIR_JSON_DIR, { recursive: true })
  const repairJsonFileName = buildRepairJsonFileName(sourceFileName, jsonFilePath)
  const repairJsonPath = path.join(REPAIR_JSON_DIR, sanitizeFileName(repairJsonFileName))
  await fsp.writeFile(repairJsonPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' })

  return {
    message: 'success',
    jsonFilePath,
    repairJsonFileName,
    repairJsonPath,
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
