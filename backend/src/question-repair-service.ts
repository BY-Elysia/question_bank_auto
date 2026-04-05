import { ARK_MODEL } from './config'
import {
  buildLegacyQuestionId,
  findQuestionNode,
  resolveQuestionTarget,
  parseQuestionIdParts,
  resolveChapterTitles,
} from './question-json-target'
import type { TextbookJsonPayload } from './types'
import {
  buildCanonicalQuestionTitle,
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
  detectQuestionEmptyAnswerIssue,
  detectQuestionIntegrityIssue,
  extractArkText,
  extractFirstJsonObject,
  extractQuestionNoFromId,
  extractQuestionNoFromText,
  getPayloadAnswerHandlingMode,
  loadTextbookJson,
  normalizeQuestionItem,
  parseModelJsonObject,
  regenerateModelJsonWithImagesByDoubao,
  repairModelJsonByDoubao,
  requestArkRawWithRetry,
  saveTextbookJson,
} from './question-bank-service'

type JsonNode = Record<string, unknown>

function createRepairError(message: string, rawText = '') {
  const error = new Error(message) as Error & { rawText?: string }
  if (rawText) {
    error.rawText = rawText
  }
  return error
}

function isStrictTextBlock(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as Record<string, unknown>
  return typeof row.text === 'string' && Array.isArray(row.media)
}

function assertStrictChildSchema(childNode: JsonNode | null, rawText: string) {
  if (!childNode) {
    throw createRepairError('Model returned no childToUpsert object', rawText)
  }
  if (!isStrictTextBlock(childNode.prompt)) {
    throw createRepairError('Model returned invalid schema: childToUpsert.prompt must be { text, media }', rawText)
  }
  if (!isStrictTextBlock(childNode.standardAnswer)) {
    throw createRepairError('Model returned invalid schema: childToUpsert.standardAnswer must be { text, media }', rawText)
  }
}

function assertStrictQuestionSchema(questionNode: JsonNode | null, rawText: string) {
  if (!questionNode) {
    throw createRepairError('Model returned no questionToUpsert object', rawText)
  }
  const nodeType = String(questionNode.nodeType || 'LEAF').trim().toUpperCase()
  if (nodeType === 'GROUP') {
    if (!isStrictTextBlock(questionNode.stem)) {
      throw createRepairError('Model returned invalid schema: GROUP.stem must be { text, media }', rawText)
    }
    if (!Array.isArray(questionNode.children)) {
      throw createRepairError('Model returned invalid schema: GROUP.children must be an array', rawText)
    }
    for (const child of questionNode.children as unknown[]) {
      if (!child || typeof child !== 'object') {
        throw createRepairError('Model returned invalid schema: GROUP.children contains a non-object child', rawText)
      }
      assertStrictChildSchema(child as JsonNode, rawText)
    }
    return
  }

  if (!isStrictTextBlock(questionNode.prompt)) {
    throw createRepairError('Model returned invalid schema: questionToUpsert.prompt must be { text, media }', rawText)
  }
  if (!isStrictTextBlock(questionNode.standardAnswer)) {
    throw createRepairError('Model returned invalid schema: questionToUpsert.standardAnswer must be { text, media }', rawText)
  }
}

function findQuestionInsertIndex(existing: unknown[], questionId: string, chapterId: string) {
  const targetQuestionNo = Number(extractQuestionNoFromId(questionId) || 0)
  let lastSameChapterIndex = -1

  for (let index = 0; index < existing.length; index += 1) {
    const row = existing[index] as Record<string, unknown>
    const rowQuestionId = typeof row.questionId === 'string' ? row.questionId.trim() : ''
    const rowChapterId = typeof row.chapterId === 'string' ? row.chapterId.trim() : ''

    if (rowQuestionId && rowQuestionId === questionId) {
      return index
    }

    if (rowChapterId === chapterId) {
      lastSameChapterIndex = index
      const rowQuestionNo = Number(
        extractQuestionNoFromId(rowQuestionId) || extractQuestionNoFromText(String(row.title || '')) || 0,
      )
      if (targetQuestionNo && rowQuestionNo && rowQuestionNo > targetQuestionNo) {
        return index
      }
    }
  }

  if (lastSameChapterIndex >= 0) {
    return lastSameChapterIndex + 1
  }

  return existing.length
}

function cloneJsonNode<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getTextBlockText(value: unknown) {
  if (value && typeof value === 'object') {
    return String((value as Record<string, unknown>).text || '')
  }
  return typeof value === 'string' ? value : ''
}

function getTextBlockObject(value: unknown) {
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return {
      text: String(row.text || ''),
      media: Array.isArray(row.media) ? row.media : [],
    }
  }
  if (typeof value === 'string') {
    return {
      text: value,
      media: [] as unknown[],
    }
  }
  return {
    text: '',
    media: [] as unknown[],
  }
}

function resolveEffectiveAnswerHandlingMode(params: {
  payload: TextbookJsonPayload
  hasAnswerSource?: boolean | null
  generateAnswerIfMissing?: boolean | null
}) {
  const {
    payload,
    hasAnswerSource = null,
    generateAnswerIfMissing = null,
  } = params

  if (typeof hasAnswerSource === 'boolean') {
    if (hasAnswerSource) {
      return 'extract_visible' as const
    }
    return generateAnswerIfMissing ? ('generate_brief' as const) : ('leave_empty' as const)
  }

  return getPayloadAnswerHandlingMode(payload)
}

function resolveRepairScope(params: {
  payload: TextbookJsonPayload
  chapterNo?: number
  sectionNo?: number
  questionNo?: number
  questionId?: string
  childQuestionId?: string
  childNo?: number | null
}) {
  const {
    payload,
    chapterNo,
    sectionNo,
    questionNo,
    questionId = '',
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

  if (!resolvedQuestionId) {
    throw new Error('questionId is required, or chapterNo/sectionNo/questionNo must all be positive integers')
  }

  const parts = parseQuestionIdParts(resolvedQuestionId)
  if (!parts) {
    throw new Error(`questionId ${resolvedQuestionId} is invalid`)
  }

  const resolvedChapterId = parts.sectionNo > 0 ? `ch_${parts.chapterNo}_${parts.sectionNo}` : `ch_${parts.chapterNo}`
  const titles = resolveChapterTitles(payload, resolvedChapterId)
  if (!titles.sectionTitle) {
    throw new Error(`chapterId ${resolvedChapterId} not found in JSON`)
  }

  const normalizedChildQuestionId = String(childQuestionId || '').trim()
  const hasChildTarget = Boolean(normalizedChildQuestionId) || (Number.isInteger(Number(childNo)) && Number(childNo) > 0)

  if (!hasChildTarget) {
    const questionNode = findQuestionNode(payload, resolvedQuestionId)
    const questionTitle =
      questionNode && typeof questionNode.title === 'string' && questionNode.title.trim()
        ? questionNode.title.trim()
        : buildCanonicalQuestionTitle(titles.sectionTitle, String(parts.questionNo))

    return {
      questionId: resolvedQuestionId,
      childQuestionId: '',
      childOrderNo: null,
      chapterId: resolvedChapterId,
      questionNo: String(parts.questionNo),
      chapterTitle: titles.chapterTitle,
    sectionTitle: titles.sectionTitle,
    questionTitle,
    childTitle: '',
    childPromptText: '',
    stemText: '',
    questionNode,
    childNode: null,
  }
  }

  const target = resolveQuestionTarget({
    payload,
    questionId: resolvedQuestionId,
    childQuestionId: normalizedChildQuestionId,
    childNo,
  })

  const childOrderNo =
    target.childNode && Number.isInteger(Number(target.childNode.orderNo)) && Number(target.childNode.orderNo) > 0
      ? Number(target.childNode.orderNo)
      : Number.isInteger(Number(childNo)) && Number(childNo) > 0
        ? Number(childNo)
        : null

  return {
    questionId: resolvedQuestionId,
    childQuestionId: target.childQuestionId,
    childOrderNo,
    chapterId: resolvedChapterId,
    questionNo: String(parts.questionNo),
    chapterTitle: titles.chapterTitle,
    sectionTitle: titles.sectionTitle,
    questionTitle: target.questionTitle,
    childTitle: target.childNode && typeof target.childNode.title === 'string' ? target.childNode.title.trim() : '',
    childPromptText: getTextBlockText(target.childNode?.prompt),
    stemText: getTextBlockText(target.questionNode?.stem),
    questionNode: target.questionNode,
    childNode: target.childNode,
  }
}

async function detectSingleQuestionRepairByDoubao(params: {
  imageDataUrls: string[]
  chapterTitle: string
  sectionTitle: string
  chapterId: string
  questionId: string
  questionNo: string
  answerHandlingMode: 'extract_visible' | 'leave_empty' | 'generate_brief'
}) {
  const {
    imageDataUrls,
    chapterTitle,
    sectionTitle,
    chapterId,
    questionId,
    questionNo,
    answerHandlingMode,
  } = params

  if (!Array.isArray(imageDataUrls) || !imageDataUrls.length) {
    throw new Error('imageDataUrls is required')
  }

  const instruction = [
    '你是教材题库的定点重写器，只负责从图片序列里提取并重写指定的一道顶层题。',
    `当前章标题：${chapterTitle}`,
    `当前节标题：${sectionTitle}`,
    `目标 chapterId：${chapterId}`,
    `目标 questionId：${questionId}`,
    `目标顶层题号：第${questionNo}题`,
    `输入图片数量：${imageDataUrls.length}`,
    '规则：',
    '1) 所有图片按上传顺序组成一个连续阅读序列，必要时要跨页合并后再识别。',
    `2) 只提取“第${questionNo}题”这一道顶层题，其他题目全部忽略。`,
    `3) 如果整组图片里没有完整出现第${questionNo}题，found 必须返回 false。`,
    '4) 如果目标题跨多张图，必须合并后再提取，不能只输出半题。',
    '5) 如果目标题是综合题/大题，可以输出 GROUP，并带上属于该题的全部可见小题。',
    '6) 如果目标题是普通单题，必须输出 LEAF。',
    `7) 输出的 questionId 必须固定为 ${questionId}；若是 GROUP.children，子题 questionId 必须在此基础上按 _1、_2 递增。`,
    `8) 输出的 chapterId 必须固定为 ${chapterId}。`,
    `9) 输出 title 必须使用“${sectionTitle} 第${questionNo}题”格式。`,
    '10) JSON 结构必须严格符合题库格式：prompt、standardAnswer、stem 都必须是对象，形如 {"text":"...", "media":[]}，绝不能返回纯字符串。',
    answerHandlingMode === 'generate_brief'
      ? '11) 这是无现成答案的文档，standardAnswer 需要基于题目生成简洁适量的答案；如果是编程题，可保留空答案。'
      : answerHandlingMode === 'leave_empty'
        ? '11) 这是无答案文档，standardAnswer 字段必须保留，但 text 为空、media 为空数组。'
        : '11) 这是有答案文档，prompt 和 standardAnswer 都必须只照抄图片里真实可见的原文/原公式；严禁自行解题、补写、改写、总结、润色。如果答案没有完整拍到，found 必须返回 false。',
    ...buildSharedQuestionContentRuleLines(12, 'questionToUpsert', answerHandlingMode),
    ...buildSharedQuestionStructureInstructionLines(answerHandlingMode),
    '只输出合法 JSON：',
    '{',
    '  "found": true/false,',
    '  "reason": "string",',
    '  "questionToUpsert": {',
    '    "questionId": "string",',
    '    "chapterId": "string",',
    '    "nodeType": "LEAF or GROUP",',
    '    "questionType": "string",',
    '    "title": "string",',
    '    "prompt": { "text": "string", "media": [] },',
    '    "standardAnswer": { "text": "string", "media": [] }',
    '  }',
    '}',
  ].join('\n')

  const raw = await requestArkRawWithRetry({
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: 'Only return valid JSON.' }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: instruction },
          ...imageDataUrls.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
        ],
      },
    ],
    temperature: 0,
  } as Record<string, unknown>)

  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Repair output is not JSON: ${text.slice(0, 500)}`)
  }

  let output: Record<string, unknown>
  try {
    output = parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    try {
      output = await regenerateModelJsonWithImagesByDoubao({
        imageDataUrls,
        originalInstruction: instruction,
        parseError,
        previousOutputText: text,
      })
    } catch (regenerateError) {
      const regenerateMsg = regenerateError instanceof Error ? regenerateError.message : String(regenerateError)
      output = await repairModelJsonByDoubao({
        brokenOutputText: text,
        parseError: `${parseError}; regenerate=${regenerateMsg}`,
      })
    }
  }

  const questionNode =
    output.questionToUpsert && typeof output.questionToUpsert === 'object'
      ? (output.questionToUpsert as JsonNode)
      : output.question && typeof output.question === 'object'
        ? (output.question as JsonNode)
        : null

  assertStrictQuestionSchema(questionNode, text)

  return {
    found: output.found === true,
    reason: typeof output.reason === 'string' ? output.reason : '',
    rawText: text,
    questionToUpsert: questionNode,
  }
}

async function detectSingleChildRepairByDoubao(params: {
  imageDataUrls: string[]
  chapterTitle: string
  sectionTitle: string
  chapterId: string
  questionId: string
  questionNo: string
  questionTitle: string
  childQuestionId: string
  childOrderNo: number
  childTitle?: string
  answerHandlingMode: 'extract_visible' | 'leave_empty' | 'generate_brief'
}) {
  const {
    imageDataUrls,
    chapterTitle,
    sectionTitle,
    chapterId,
    questionId,
    questionNo,
    questionTitle,
    childQuestionId,
    childOrderNo,
    childTitle = '',
    answerHandlingMode,
  } = params

  if (!Array.isArray(imageDataUrls) || !imageDataUrls.length) {
    throw new Error('imageDataUrls is required')
  }

  const instruction = [
    '你是教材题库的小题定点重写器。',
    '这次只允许你重写指定的一个小题，不能重写整道大题，不能输出其他兄弟小题。',
    `当前章标题：${chapterTitle}`,
    `当前节标题：${sectionTitle}`,
    `当前 chapterId：${chapterId}`,
    `父题 questionId：${questionId}`,
    `父题题号：第${questionNo}题`,
    `父题标题：${questionTitle}`,
    `目标小题 questionId：${childQuestionId}`,
    `目标小题序号：第${childOrderNo}小题`,
    `目标定位口径：这是“第${questionNo}题中的第${childOrderNo}小题”，不是整份习题里的“第${childOrderNo}题”。`,
    childTitle ? `目标小题标题提示：${childTitle}` : '',
    `输入图片数量：${imageDataUrls.length}`,
    '规则：',
    '1) 所有图片按上传顺序组成一个连续阅读序列，必要时要跨页合并后再识别。',
    `2) 只提取父题 ${questionId} 下的第${childOrderNo}小题，其他顶层题和其他兄弟小题全部忽略。`,
    `3) 如果第${childOrderNo}小题在整组图片里没有完整出现，found 必须返回 false。`,
    '4) 注意区分“第N题”和“某道题里的第N小题/编号(N)”。如果图片里只写“(5)”，这里应优先理解为父题内部的小题编号，而不是整页的第5题。',
    '5) 不要依赖已有 JSON 里的旧题文内容来反推答案；如果图片与旧 JSON 冲突，以图片为准。',
    `6) 返回的小题对象必须固定 questionId=${childQuestionId}、orderNo=${childOrderNo}、chapterId=${chapterId}。`,
    '7) 你只能输出一个“小题对象”，字段应包含：questionId、title、orderNo、questionType、chapterId、prompt、standardAnswer、defaultScore、rubric。',
    '8) JSON 结构必须严格符合题库格式：prompt、standardAnswer 都必须是对象，形如 {"text":"...", "media":[]}，绝不能返回纯字符串。',
    '9) prompt.text 只能写这个小题自己的题目内容，不能混入其他小题内容。',
    '10) 这个小题的题目或答案可能跨页连续出现；如果本页结尾未结束，要继续读取下一页，直到下一个同级编号小题开始。',
    '11)公式必须转成 LaTeX，使用Katex语法，不得改成口语描述。',
    answerHandlingMode === 'generate_brief'
      ? '11) 这是无现成答案的文档，standardAnswer 需要基于题目生成简洁适量的答案；如果是编程题，可保留空答案。'
      : answerHandlingMode === 'leave_empty'
        ? '11) 这是无答案文档，standardAnswer 字段必须保留，但 text 为空、media 为空数组。'
        : '11) 这是有答案文档，prompt 和 standardAnswer 都必须只照抄图片里真实可见的原文/原公式；严禁自行解题、补写、改写、总结、润色。如果答案没有完整拍到，found 必须返回 false。',
    '只输出合法 JSON：',
    '{',
    '  "found": true/false,',
    '  "reason": "string",',
    '  "childToUpsert": {',
    '    "questionId": "string",',
    '    "title": "string",',
    '    "orderNo": 1,',
    '    "questionType": "string",',
    '    "chapterId": "string",',
    '    "prompt": { "text": "string", "media": [] },',
    '    "standardAnswer": { "text": "string", "media": [] },',
    '    "defaultScore": 5,',
    '    "rubric": "string"',
    '  }',
    '}',
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await requestArkRawWithRetry({
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: 'Only return valid JSON.' }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: instruction },
          ...imageDataUrls.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
        ],
      },
    ],
    temperature: 0,
  } as Record<string, unknown>)

  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Repair output is not JSON: ${text.slice(0, 500)}`)
  }

  let output: Record<string, unknown>
  try {
    output = parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    try {
      output = await regenerateModelJsonWithImagesByDoubao({
        imageDataUrls,
        originalInstruction: instruction,
        parseError,
        previousOutputText: text,
      })
    } catch (regenerateError) {
      const regenerateMsg = regenerateError instanceof Error ? regenerateError.message : String(regenerateError)
      output = await repairModelJsonByDoubao({
        brokenOutputText: text,
        parseError: `${parseError}; regenerate=${regenerateMsg}`,
      })
    }
  }

  const childNode =
    output.childToUpsert && typeof output.childToUpsert === 'object'
      ? (output.childToUpsert as JsonNode)
      : output.child && typeof output.child === 'object'
        ? (output.child as JsonNode)
        : null

  assertStrictChildSchema(childNode, text)

  return {
    found: output.found === true,
    reason: typeof output.reason === 'string' ? output.reason : '',
    rawText: text,
    childToUpsert: childNode,
  }
}

function findChildIndex(questionNode: JsonNode, params: { childQuestionId?: string; childNo?: number | null }) {
  const { childQuestionId = '', childNo = null } = params
  const children = Array.isArray(questionNode.children) ? questionNode.children : []
  const normalizedChildQuestionId = String(childQuestionId || '').trim()

  let childIndex = normalizedChildQuestionId
    ? children.findIndex(
        (item) => item && typeof item === 'object' && String((item as JsonNode).questionId || '').trim() === normalizedChildQuestionId,
      )
    : -1

  if (childIndex < 0 && Number.isInteger(Number(childNo)) && Number(childNo) > 0) {
    childIndex = children.findIndex(
      (item) => item && typeof item === 'object' && Number((item as JsonNode).orderNo) === Number(childNo),
    )
  }

  if (childIndex < 0 && Number.isInteger(Number(childNo)) && Number(childNo) > 0) {
    childIndex = children.findIndex(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as JsonNode).questionId === 'string' &&
        String((item as JsonNode).questionId).trim().endsWith(`_${Number(childNo)}`),
    )
  }

  return childIndex
}

function normalizeRepairedChildQuestion(params: {
  parentQuestionNode: JsonNode
  originalChildNode: JsonNode
  sectionTitle: string
  chapterId: string
  questionNo: string
  childQuestionId: string
  childOrderNo: number
  childToUpsert: JsonNode
  expectAnswer: boolean
  answerHandlingMode: 'extract_visible' | 'leave_empty' | 'generate_brief'
}) {
  const {
    parentQuestionNode,
    originalChildNode,
    sectionTitle,
    chapterId,
    questionNo,
    childQuestionId,
    childOrderNo,
    childToUpsert,
    expectAnswer,
    answerHandlingMode,
  } = params

  const rawParentQuestion = cloneJsonNode(parentQuestionNode)
  const childIndex = findChildIndex(rawParentQuestion, {
    childQuestionId,
    childNo: childOrderNo,
  })
  if (childIndex < 0) {
    throw new Error(`childQuestionId ${childQuestionId} not found under questionId ${String(rawParentQuestion.questionId || '')}`)
  }

  const rawParentChildren = Array.isArray(rawParentQuestion.children) ? rawParentQuestion.children : []
  rawParentQuestion.children = rawParentChildren

  const originalAnswerBlock = getTextBlockObject(originalChildNode.standardAnswer)
  const nextAnswerBlock = getTextBlockObject(childToUpsert.standardAnswer)
  const mergedStandardAnswer =
    nextAnswerBlock.text.trim() || (Array.isArray(nextAnswerBlock.media) && nextAnswerBlock.media.length)
      ? childToUpsert.standardAnswer
      : {
          text: originalAnswerBlock.text,
          media: originalAnswerBlock.media,
        }

  rawParentChildren.splice(childIndex, 1, {
    ...childToUpsert,
    questionId: childQuestionId,
    orderNo: childOrderNo,
    chapterId,
    standardAnswer: mergedStandardAnswer,
    title:
      buildCanonicalQuestionTitle(sectionTitle, questionNo, String(childOrderNo))
      || String(childToUpsert.title || childQuestionId),
  })

  const normalizedQuestion = normalizeQuestionItem(
    rawParentQuestion,
    chapterId,
    sectionTitle,
    {
      expectAnswer,
      answerHandlingMode,
    },
  )

  if (!normalizedQuestion) {
    throw new Error('Child rewrite result could not be normalized into a valid GROUP question')
  }
  if (normalizedQuestion.nodeType !== 'GROUP') {
    throw new Error('Child rewrite result was normalized into a non-GROUP question')
  }

  const normalizedChildren = normalizedQuestion.children
  const normalizedChild = normalizedChildren.find(
    (item) => typeof item.questionId === 'string' && item.questionId.trim() === childQuestionId,
  )
  if (!normalizedChild) {
    throw new Error(`Normalized child ${childQuestionId} not found after rewrite`)
  }

  return {
    normalizedQuestion,
    normalizedChild,
  }
}

export async function repairQuestionInTextbookJson(params: {
  jsonFilePath: string
  chapterNo?: number
  sectionNo?: number
  questionNo?: number
  questionId?: string
  childQuestionId?: string
  childNo?: number | null
  hasAnswerSource?: boolean | null
  generateAnswerIfMissing?: boolean | null
  imageDataUrls: string[]
  imageLabels?: string[]
  sourceFileName?: string
}) {
  const {
    jsonFilePath,
    chapterNo,
    sectionNo,
    questionNo,
    questionId = '',
    childQuestionId = '',
    childNo = null,
    hasAnswerSource = null,
    generateAnswerIfMissing = null,
    imageDataUrls,
    imageLabels = [],
    sourceFileName = '',
  } = params

  void sourceFileName

  const payload = await loadTextbookJson(jsonFilePath)
  const answerHandlingMode = resolveEffectiveAnswerHandlingMode({
    payload,
    hasAnswerSource,
    generateAnswerIfMissing,
  })
  const effectiveExpectAnswer = answerHandlingMode !== 'leave_empty'
  const allowBlankCodeAnswer = answerHandlingMode === 'generate_brief'
  const scope = resolveRepairScope({
    payload,
    chapterNo,
    sectionNo,
    questionNo,
    questionId,
    childQuestionId,
    childNo,
  })

  const existing = Array.isArray(payload.questions) ? [...payload.questions] : []
  const replaceIndex = existing.findIndex((item) => {
    const row = item as Record<string, unknown>
    return typeof row.questionId === 'string' && row.questionId.trim() === scope.questionId
  })

  if (scope.childQuestionId) {
    if (!scope.questionNode || !scope.childNode || !scope.childOrderNo) {
      throw new Error('childQuestionId or childNo is required when rewriting a child question')
    }
    if (replaceIndex < 0) {
      throw new Error(`questionId ${scope.questionId} not found in JSON`)
    }

    const repairDetect = await detectSingleChildRepairByDoubao({
      imageDataUrls,
      chapterTitle: scope.chapterTitle,
      sectionTitle: scope.sectionTitle,
      chapterId: scope.chapterId,
      questionId: scope.questionId,
      questionNo: scope.questionNo,
      questionTitle: scope.questionTitle,
      childQuestionId: scope.childQuestionId,
      childOrderNo: scope.childOrderNo,
      childTitle: scope.childTitle,
      answerHandlingMode,
    })

    if (!repairDetect.found || !repairDetect.childToUpsert) {
      throw createRepairError(
        repairDetect.reason || `未能从图片中完整识别第${scope.questionNo}题的小题 ${scope.childOrderNo}`,
        repairDetect.rawText,
      )
    }

    const { normalizedQuestion, normalizedChild } = normalizeRepairedChildQuestion({
      parentQuestionNode: scope.questionNode,
      originalChildNode: scope.childNode,
      sectionTitle: scope.sectionTitle,
      chapterId: scope.chapterId,
      questionNo: scope.questionNo,
      childQuestionId: scope.childQuestionId,
      childOrderNo: scope.childOrderNo,
      childToUpsert: repairDetect.childToUpsert,
      expectAnswer: effectiveExpectAnswer,
      answerHandlingMode,
    })

    const emptyAnswerIssue = detectQuestionEmptyAnswerIssue(normalizedQuestion, { expectAnswer: effectiveExpectAnswer, allowBlankCodeAnswer })
    if (emptyAnswerIssue) {
      throw createRepairError(emptyAnswerIssue, repairDetect.rawText)
    }

    const integrityIssue = detectQuestionIntegrityIssue([normalizedQuestion], { expectAnswer: effectiveExpectAnswer, allowBlankCodeAnswer })
    if (integrityIssue) {
      throw createRepairError(integrityIssue.reason, repairDetect.rawText)
    }

    existing[replaceIndex] = normalizedQuestion
    payload.questions = existing
    await saveTextbookJson(jsonFilePath, payload)

    return {
      message: 'success',
      jsonFilePath,
      imageLabel: imageLabels.join(' + '),
      imageCount: imageDataUrls.length,
      chapterTitle: scope.chapterTitle,
      sectionTitle: scope.sectionTitle,
      chapterId: scope.chapterId,
      questionId: scope.questionId,
      childQuestionId: scope.childQuestionId,
      childNo: scope.childOrderNo,
      questionTitle: normalizedChild.title,
      action: 'replaced_child',
      insertIndex: replaceIndex,
      questionsCount: existing.length,
      reason: repairDetect.reason,
      rawText: repairDetect.rawText,
      question: normalizedQuestion,
      targetLabel: `小题 ${scope.childOrderNo}`,
      expectAnswer: effectiveExpectAnswer,
    }
  }

  const repairDetect = await detectSingleQuestionRepairByDoubao({
    imageDataUrls,
    chapterTitle: scope.chapterTitle,
    sectionTitle: scope.sectionTitle,
    chapterId: scope.chapterId,
    questionId: scope.questionId,
    questionNo: scope.questionNo,
    answerHandlingMode,
  })

  if (!repairDetect.found || !repairDetect.questionToUpsert) {
    throw createRepairError(repairDetect.reason || `未能从图片中完整识别第${scope.questionNo}题`, repairDetect.rawText)
  }

  const normalized = normalizeQuestionItem(
    {
      ...repairDetect.questionToUpsert,
      questionId: scope.questionId,
      chapterId: scope.chapterId,
      title: buildCanonicalQuestionTitle(scope.sectionTitle, scope.questionNo),
    },
    scope.chapterId,
    scope.sectionTitle,
    {
      expectAnswer: effectiveExpectAnswer,
      answerHandlingMode,
    },
  )

  if (!normalized) {
    throw createRepairError('Repair result could not be normalized into a valid question', repairDetect.rawText)
  }

  const normalizedQuestionNo =
    extractQuestionNoFromId(normalized.questionId) || extractQuestionNoFromText(normalized.title)
  if (String(normalizedQuestionNo || '') !== String(scope.questionNo)) {
    throw createRepairError(
      `Model returned a mismatched question number: target=${scope.questionNo}, got=${normalizedQuestionNo || 'unknown'}`,
      repairDetect.rawText,
    )
  }

  const emptyAnswerIssue = detectQuestionEmptyAnswerIssue(normalized, { expectAnswer: effectiveExpectAnswer, allowBlankCodeAnswer })
  if (emptyAnswerIssue) {
    throw createRepairError(emptyAnswerIssue, repairDetect.rawText)
  }

  const integrityIssue = detectQuestionIntegrityIssue([normalized], { expectAnswer: effectiveExpectAnswer, allowBlankCodeAnswer })
  if (integrityIssue) {
    throw createRepairError(integrityIssue.reason, repairDetect.rawText)
  }

  const insertIndex =
    replaceIndex >= 0 ? replaceIndex : findQuestionInsertIndex(existing, scope.questionId, scope.chapterId)

  if (replaceIndex >= 0) {
    existing[replaceIndex] = normalized
  } else {
    existing.splice(insertIndex, 0, normalized)
  }

  payload.questions = existing
  await saveTextbookJson(jsonFilePath, payload)

  return {
    message: 'success',
    jsonFilePath,
    imageLabel: imageLabels.join(' + '),
    imageCount: imageDataUrls.length,
    chapterTitle: scope.chapterTitle,
    sectionTitle: scope.sectionTitle,
    chapterId: scope.chapterId,
    questionId: scope.questionId,
    childQuestionId: '',
    childNo: null,
    questionTitle: normalized.title,
    action: replaceIndex >= 0 ? 'replaced' : 'inserted',
    insertIndex,
    questionsCount: existing.length,
    reason: repairDetect.reason,
    rawText: repairDetect.rawText,
    question: normalized,
    targetLabel: '当前题目',
    expectAnswer: effectiveExpectAnswer,
  }
}
