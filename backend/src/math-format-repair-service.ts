import fsp from 'node:fs/promises'
import path from 'node:path'
import { ARK_API_KEY, ARK_MODEL, REPAIR_JSON_DIR } from './config'
import type { TextbookJsonPayload } from './types'
import {
  extractArkText,
  extractFirstJsonObject,
  loadTextbookJson,
  normalizeJsonFileName,
  parseModelJsonObject,
  repairModelJsonByDoubao,
  requestArkRawWithRetry,
  saveTextbookJson,
} from './question-bank-service'

type MathFormatRepairTargetType =
  | 'stem'
  | 'prompt'
  | 'standardAnswer'
  | 'childPrompt'
  | 'childStandardAnswer'

type JsonNode = Record<string, unknown>

function findChapterById(payload: TextbookJsonPayload, chapterId: string) {
  return payload.chapters.find((item) => item.chapterId === chapterId) || null
}

function buildRepairJsonFileName(sourceFileName: string, jsonFilePath: string) {
  const preferred = String(sourceFileName || '').trim()
  if (preferred) {
    const base = path.basename(preferred).replace(/[\\/:*?"<>|]/g, '_')
    return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
  }
  return normalizeJsonFileName(path.basename(jsonFilePath))
}

function isObject(value: unknown): value is JsonNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getOrCreateTextBlock(host: JsonNode, key: string) {
  const current = host[key]
  if (isObject(current)) {
    if (typeof current.text !== 'string') {
      current.text = ''
    }
    if (!Array.isArray(current.media)) {
      current.media = []
    }
    return current
  }
  if (typeof current === 'string') {
    const block = { text: current, media: [] as unknown[] }
    host[key] = block
    return block
  }
  const block = { text: '', media: [] as unknown[] }
  host[key] = block
  return block
}

function findQuestionNode(payload: TextbookJsonPayload, questionId: string) {
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  return (
    questions.find((item) => isObject(item) && typeof item.questionId === 'string' && item.questionId.trim() === questionId) ||
    null
  ) as JsonNode | null
}

function findChildNode(questionNode: JsonNode, childNo: number) {
  const children = Array.isArray(questionNode.children) ? questionNode.children.filter(isObject) : []
  if (!children.length) {
    return null
  }

  const byOrder = children.find((child) => Number(child.orderNo) === childNo)
  if (byOrder) {
    return byOrder
  }

  const suffix = `_${childNo}`
  const byId = children.find(
    (child) => typeof child.questionId === 'string' && child.questionId.trim().endsWith(suffix),
  )
  if (byId) {
    return byId
  }

  return children[childNo - 1] || null
}

function resolveRepairTarget(params: {
  payload: TextbookJsonPayload
  chapterNo: number
  sectionNo: number
  questionNo: number
  targetType: MathFormatRepairTargetType
  childNo?: number | null
}) {
  const { payload, chapterNo, sectionNo, questionNo, targetType, childNo = null } = params
  const topChapterId = `ch_${chapterNo}`
  const sectionChapterId = `ch_${chapterNo}_${sectionNo}`
  const questionId = `q_${chapterNo}_${sectionNo}_${questionNo}`

  const topChapter = findChapterById(payload, topChapterId)
  if (!topChapter) {
    throw new Error(`chapterId ${topChapterId} not found in JSON`)
  }
  const section = findChapterById(payload, sectionChapterId)
  if (!section) {
    throw new Error(`chapterId ${sectionChapterId} not found in JSON`)
  }
  const questionNode = findQuestionNode(payload, questionId)
  if (!questionNode) {
    throw new Error(`questionId ${questionId} not found in JSON`)
  }

  const questionTitle =
    typeof questionNode.title === 'string' && questionNode.title.trim() ? questionNode.title.trim() : questionId

  if (targetType === 'stem') {
    const textBlock = getOrCreateTextBlock(questionNode, 'stem')
    return {
      topChapter,
      section,
      questionNode,
      childNode: null,
      textBlock,
      targetLabel: '题目 stem',
      questionId,
      childQuestionId: '',
      questionTitle,
    }
  }

  if (targetType === 'prompt' || targetType === 'standardAnswer') {
    const textBlock = getOrCreateTextBlock(questionNode, targetType)
    return {
      topChapter,
      section,
      questionNode,
      childNode: null,
      textBlock,
      targetLabel: targetType === 'prompt' ? '题目 prompt' : '题目 standardAnswer',
      questionId,
      childQuestionId: '',
      questionTitle,
    }
  }

  if (!Number.isInteger(childNo) || Number(childNo) <= 0) {
    throw new Error('childNo must be a positive integer when repairing child fields')
  }

  const childNode = findChildNode(questionNode, Number(childNo))
  if (!childNode) {
    throw new Error(`childNo ${childNo} not found under questionId ${questionId}`)
  }

  const childField = targetType === 'childPrompt' ? 'prompt' : 'standardAnswer'
  const textBlock = getOrCreateTextBlock(childNode, childField)
  return {
    topChapter,
    section,
    questionNode,
    childNode,
    textBlock,
    targetLabel: targetType === 'childPrompt' ? `小题 ${childNo} prompt` : `小题 ${childNo} standardAnswer`,
    questionId,
    childQuestionId: typeof childNode.questionId === 'string' ? childNode.questionId : '',
    questionTitle,
  }
}

async function repairMathFormatByModel(params: {
  chapterTitle: string
  sectionTitle: string
  questionTitle: string
  questionId: string
  targetLabel: string
  originalText: string
}) {
  const { chapterTitle, sectionTitle, questionTitle, questionId, targetLabel, originalText } = params

  if (!ARK_API_KEY) {
    throw new Error('ARK_API_KEY is missing')
  }

  const instruction = [
    '你是教材题库 JSON 的公式格式修复器。你只修复一个指定文本块中的数学公式格式，使其更稳定地通过 KaTeX 渲染。',
    `- 当前章标题: ${chapterTitle}`,
    `- 当前小节标题: ${sectionTitle}`,
    `- 当前题目标题: ${questionTitle}`,
    `- 当前 questionId: ${questionId}`,
    `- 当前目标字段: ${targetLabel}`,
    '任务要求:',
    '1) 只修复公式格式、数学排版、定界符、环境闭合、KaTeX 兼容写法，以及必要的反斜杠命令规范。',
    '2) 必须尽量保留原有中文叙述、推导结构、题意和数学含义，不要改写成另一种解法。',
    '3) 不要删减内容，不要凭空补充题目中不存在的句子。',
    '4) 若原文只是 KaTeX 兼容性差，可做等价的排版修正，例如微分符号、\\left/\\right、aligned 环境、行内/块级公式边界。',
    '5) 不要修改题号、章标题、小节标题、分值等结构信息。',
    '6) 不要输出 markdown 代码块。',
    '7) 你必须输出合法 JSON，对字符串中的反斜杠做好 JSON 转义。',
    '输出格式固定为:',
    '{',
    '  "repairedText": "string",',
    '  "reason": "string"',
    '}',
    '下面是待修复的原始文本，请只针对这一个文本块工作:',
    originalText,
  ].join('\n')

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: instruction }],
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Math format repair output is not JSON: ${text.slice(0, 500)}`)
  }

  let output: Record<string, unknown>
  try {
    output = parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    output = await repairModelJsonByDoubao({
      brokenOutputText: text,
      parseError,
    })
  }

  const repairedText = typeof output.repairedText === 'string'
    ? output.repairedText
    : typeof output.text === 'string'
      ? output.text
      : ''

  if (!repairedText.trim()) {
    throw new Error('模型没有返回 repairedText')
  }

  return {
    repairedText: repairedText.replace(/\r\n/g, '\n'),
    reason: typeof output.reason === 'string' ? output.reason : '',
    rawText: text,
  }
}

export async function repairMathFormatInTextbookJson(params: {
  jsonFilePath: string
  sourceFileName?: string
  chapterNo: number
  sectionNo: number
  questionNo: number
  targetType: MathFormatRepairTargetType
  childNo?: number | null
}) {
  const {
    jsonFilePath,
    sourceFileName = '',
    chapterNo,
    sectionNo,
    questionNo,
    targetType,
    childNo = null,
  } = params

  const allowedTargetTypes = new Set<MathFormatRepairTargetType>([
    'stem',
    'prompt',
    'standardAnswer',
    'childPrompt',
    'childStandardAnswer',
  ])

  if (!Number.isInteger(chapterNo) || chapterNo <= 0) {
    throw new Error('chapterNo must be a positive integer')
  }
  if (!Number.isInteger(sectionNo) || sectionNo <= 0) {
    throw new Error('sectionNo must be a positive integer')
  }
  if (!Number.isInteger(questionNo) || questionNo <= 0) {
    throw new Error('questionNo must be a positive integer')
  }
  if (!allowedTargetTypes.has(targetType)) {
    throw new Error(`targetType is invalid: ${targetType}`)
  }

  const payload = await loadTextbookJson(jsonFilePath)
  const target = resolveRepairTarget({
    payload,
    chapterNo,
    sectionNo,
    questionNo,
    targetType,
    childNo,
  })

  const originalText = typeof target.textBlock.text === 'string' ? target.textBlock.text : ''
  if (!originalText.trim()) {
    throw new Error(`${target.targetLabel} 当前为空，无法执行公式修复`)
  }

  const repaired = await repairMathFormatByModel({
    chapterTitle: target.topChapter.title,
    sectionTitle: target.section.title,
    questionTitle: target.questionTitle,
    questionId: target.childQuestionId || target.questionId,
    targetLabel: target.targetLabel,
    originalText,
  })

  target.textBlock.text = repaired.repairedText
  await saveTextbookJson(jsonFilePath, payload)

  await fsp.mkdir(REPAIR_JSON_DIR, { recursive: true })
  const repairJsonFileName = buildRepairJsonFileName(sourceFileName, jsonFilePath)
  const repairJsonPath = path.join(REPAIR_JSON_DIR, repairJsonFileName)
  await fsp.writeFile(repairJsonPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' })

  return {
    message: 'success',
    jsonFilePath,
    repairJsonFileName,
    repairJsonPath,
    chapterTitle: target.topChapter.title,
    sectionTitle: target.section.title,
    questionId: target.questionId,
    childQuestionId: target.childQuestionId,
    questionTitle: target.questionTitle,
    targetType,
    childNo: childNo || null,
    targetLabel: target.targetLabel,
    previousText: originalText,
    repairedText: repaired.repairedText,
    reason: repaired.reason,
    rawText: repaired.rawText,
  }
}
