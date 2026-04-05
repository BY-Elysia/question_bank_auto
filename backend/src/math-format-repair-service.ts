import { ARK_MODEL } from './config'
import {
  buildLegacyQuestionId,
  isObject,
  resolveQuestionTarget,
} from './question-json-target'
import type { TextbookJsonPayload } from './types'
import {
  extractArkText,
  extractFirstJsonObject,
  loadTextbookJson,
  payloadExpectsAnswer,
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

function resolveRepairTarget(params: {
  payload: TextbookJsonPayload
  chapterNo?: number
  sectionNo?: number
  questionNo?: number
  questionId?: string
  targetType: MathFormatRepairTargetType
  childQuestionId?: string
  childNo?: number | null
}) {
  const {
    payload,
    chapterNo,
    sectionNo,
    questionNo,
    questionId = '',
    targetType,
    childQuestionId = '',
    childNo = null,
  } = params
  const resolvedQuestionId = String(questionId || '').trim()
    || (
      Number.isInteger(chapterNo) &&
      Number.isInteger(sectionNo) &&
      Number.isInteger(questionNo)
        ? buildLegacyQuestionId(Number(chapterNo), Number(sectionNo), Number(questionNo))
        : ''
    )

  const target = resolveQuestionTarget({
    payload,
    questionId: resolvedQuestionId,
    childQuestionId,
    childNo,
  })

  if (targetType === 'stem') {
    return {
      ...target,
      textBlock: getOrCreateTextBlock(target.questionNode, 'stem'),
      targetLabel: '题目 stem',
    }
  }

  if (targetType === 'prompt' || targetType === 'standardAnswer') {
    return {
      ...target,
      textBlock: getOrCreateTextBlock(target.questionNode, targetType),
      targetLabel: targetType === 'prompt' ? '题目 prompt' : '题目 standardAnswer',
    }
  }

  if (!target.childNode) {
    throw new Error('childQuestionId or childNo is required when repairing child fields')
  }

  const childField = targetType === 'childPrompt' ? 'prompt' : 'standardAnswer'
  return {
    ...target,
    textBlock: getOrCreateTextBlock(target.childNode, childField),
    targetLabel: targetType === 'childPrompt' ? '小题 prompt' : '小题 standardAnswer',
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
  chapterNo?: number
  sectionNo?: number
  questionNo?: number
  questionId?: string
  targetType: MathFormatRepairTargetType
  childQuestionId?: string
  childNo?: number | null
}) {
  const {
    jsonFilePath,
    sourceFileName = '',
    chapterNo,
    sectionNo,
    questionNo,
    questionId = '',
    targetType,
    childQuestionId = '',
    childNo = null,
  } = params

  const allowedTargetTypes = new Set<MathFormatRepairTargetType>([
    'stem',
    'prompt',
    'standardAnswer',
    'childPrompt',
    'childStandardAnswer',
  ])
  const hasLegacyQuestionRef =
    Number.isInteger(chapterNo) &&
    Number(chapterNo) > 0 &&
    Number.isInteger(sectionNo) &&
    Number(sectionNo) > 0 &&
    Number.isInteger(questionNo) &&
    Number(questionNo) > 0

  if (!String(questionId || '').trim() && !hasLegacyQuestionRef) {
    throw new Error('questionId is required, or chapterNo/sectionNo/questionNo must all be positive integers')
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
    questionId,
    targetType,
    childQuestionId,
    childNo,
  })

  const originalText = typeof target.textBlock.text === 'string' ? target.textBlock.text : ''
  if (!originalText.trim()) {
    throw new Error(`${target.targetLabel} 当前为空，无法执行公式修复`)
  }

  const repaired = await repairMathFormatByModel({
    chapterTitle: target.chapterTitle,
    sectionTitle: target.sectionTitle,
    questionTitle: target.questionTitle,
    questionId: target.childQuestionId || target.questionId,
    targetLabel: target.targetLabel,
    originalText,
  })

  target.textBlock.text = repaired.repairedText
  await saveTextbookJson(jsonFilePath, payload)

  return {
    message: 'success',
    jsonFilePath,
    chapterTitle: target.chapterTitle,
    sectionTitle: target.sectionTitle,
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
    expectAnswer: payloadExpectsAnswer(payload),
  }
}
