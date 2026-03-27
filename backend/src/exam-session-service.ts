import {
  ARK_MODEL,
  MAX_PENDING_QUEUE_PAGES,
} from './config'
import {
  batchId,
  buildCanonicalQuestionTitle,
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
  detectQuestionIntegrityIssue,
  extractArkText,
  extractFirstJsonObject,
  getPayloadDocumentType,
  getPayloadSourceMeta,
  loadTextbookJson,
  normalizeQuestionItem,
  normalizeTitle,
  parseModelJsonObject,
  requestArkRawWithRetry,
  saveTextbookJson,
  upsertQuestionsById,
} from './question-bank-service'
import { examQuestionSessions, examSessions } from './state'
import type {
  ExamCombinedExtractResult,
  ExamQuestionSessionState,
  ExamSessionState,
  QuestionBoundaryResult,
  QuestionItem,
  TextbookJsonPayload,
} from './types'

type ExamStructureContext = {
  majorTitle: string
  minorTitle: string
  chapterId: string
}

function normalizeDigits(value: string) {
  return String(value || '').replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248))
}

function parseChineseNumberToken(rawToken: string) {
  const token = String(rawToken || '').trim()
  if (!token) return 0
  if (/^\d+$/.test(token)) return Number(token)
  const map: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  let total = 0
  let current = 0
  for (const ch of token) {
    if (map[ch] !== undefined) {
      current = map[ch]
      continue
    }
    if (ch === '十') {
      total += (current || 1) * 10
      current = 0
      continue
    }
    if (ch === '百') {
      total += (current || 1) * 100
      current = 0
      continue
    }
  }
  return total + current
}

function extractExamMajorNo(titleInput: string) {
  const title = normalizeTitle(titleInput)
  const zhMatch = title.match(/^\s*([零一二两三四五六七八九十百]+)\s*[、.．。]/)
  if (zhMatch?.[1]) {
    return parseChineseNumberToken(zhMatch[1])
  }
  const digitMatch = normalizeDigits(title).match(/^\s*(\d+)\s*[、.．。]/)
  if (digitMatch?.[1]) {
    return Number(digitMatch[1])
  }
  return 0
}

function extractExamMinorNo(titleInput: string, expectedMajorNo: number) {
  const title = normalizeDigits(normalizeTitle(titleInput))
  const explicit = title.match(/^(\d+)\s*[._．。]\s*(\d+)/)
  if (!explicit?.[1] || !explicit?.[2]) {
    return 0
  }
  const majorNo = Number(explicit[1])
  const minorNo = Number(explicit[2])
  if (expectedMajorNo > 0 && majorNo !== expectedMajorNo) {
    return 0
  }
  return minorNo > 0 ? minorNo : 0
}

function ensureExamMajorChapter(payload: TextbookJsonPayload, titleInput: string) {
  const title = normalizeTitle(titleInput)
  const existing = payload.chapters.find((item) => item.parentId === null && normalizeTitle(item.title) === title)
  if (existing) {
    return existing
  }

  const topItems = payload.chapters.filter((item) => item.parentId === null)
  const maxOrder = topItems.reduce((max, item) => Math.max(max, Number(item.orderNo) || 0), 0)
  const maxIdNum = topItems.reduce((max, item) => {
    const match = String(item.chapterId || '').trim().match(/^ch_(\d+)$/)
    const numeric = match?.[1] ? Number(match[1]) : 0
    return Math.max(max, numeric)
  }, 0)
  const parsedMajorNo = extractExamMajorNo(title)
  const majorNo = parsedMajorNo > 0 ? parsedMajorNo : maxIdNum + 1

  const created = {
    chapterId: `ch_${majorNo}`,
    parentId: null,
    title,
    orderNo: parsedMajorNo > 0 ? parsedMajorNo : maxOrder + 1,
  }
  payload.chapters.push(created)
  return created
}

function ensureExamMinorChapter(payload: TextbookJsonPayload, parentChapterId: string, titleInput: string) {
  const title = normalizeTitle(titleInput)
  const existing = payload.chapters.find(
    (item) => item.parentId === parentChapterId && normalizeTitle(item.title) === title,
  )
  if (existing) {
    return existing
  }

  const parentMajorNo = Number(String(parentChapterId || '').replace(/^ch_/, '')) || 0
  const siblings = payload.chapters.filter((item) => item.parentId === parentChapterId)
  const maxOrder = siblings.reduce((max, item) => Math.max(max, Number(item.orderNo) || 0), 0)
  const maxMinorNo = siblings.reduce((max, item) => {
    const match = String(item.chapterId || '').trim().match(/^ch_\d+_(\d+)$/)
    const numeric = match?.[1] ? Number(match[1]) : 0
    return Math.max(max, numeric)
  }, 0)
  const minorNo = extractExamMinorNo(title, parentMajorNo) || maxMinorNo + 1

  const created = {
    chapterId: `ch_${parentMajorNo}_${minorNo}`,
    parentId: parentChapterId,
    title,
    orderNo: minorNo > 0 ? minorNo : maxOrder + 1,
  }
  payload.chapters.push(created)
  return created
}

function ensureExamStructureContext(
  payload: TextbookJsonPayload,
  majorTitleInput: string,
  minorTitleInput = '',
) {
  const majorTitle = normalizeTitle(majorTitleInput)
  if (!majorTitle) {
    throw new Error('majorTitle is required')
  }
  const major = ensureExamMajorChapter(payload, majorTitle)
  const minorTitle = normalizeTitle(minorTitleInput)
  if (!minorTitle) {
    return {
      majorTitle,
      minorTitle: '',
      chapterId: major.chapterId,
    } as ExamStructureContext
  }
  const minor = ensureExamMinorChapter(payload, major.chapterId, minorTitle)
  return {
    majorTitle,
    minorTitle,
    chapterId: minor.chapterId,
  } as ExamStructureContext
}

function buildExamStructureLabel(majorTitle: string, minorTitle: string) {
  return [normalizeTitle(majorTitle), normalizeTitle(minorTitle)].filter(Boolean).join(' / ') || '未识别结构'
}

function buildExamCrossPageContext(params: {
  processingStartQuestionKey: string | null
  pendingPagesCount: number
  pendingPageLabels?: string[]
}) {
  const {
    processingStartQuestionKey,
    pendingPagesCount,
    pendingPageLabels = [],
  } = params
  return [
    '跨页补充说明:',
    `- 当前处理起点题号: ${processingStartQuestionKey || 'null'}`,
    `- 当前待补队列页数: ${pendingPagesCount}`,
    pendingPageLabels.length ? `- 当前待补队列页文件名: ${pendingPageLabels.join(' + ')}` : '',
    '- 当前请求输入图顺序固定: 前N-1张为待补队列页，最后1张为当前新页。',
    '- 如果当前处理起点题号为 null，则从队列第一页图片中实际出现的第一个顶层大题开始。',
    '- 你应先判断从当前处理起点开始哪些题已经完整可入库，再判断最后一张图的最后一题是否跨页。',
  ].filter(Boolean).join(' ')
}

async function requestExamJsonObject(params: {
  instruction: string
  imageDataUrls: string[]
}) {
  const { instruction, imageDataUrls } = params
  const raw = await requestArkRawWithRetry({
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
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
    throw new Error(`Model output is not JSON: ${text.slice(0, 500)}`)
  }

  return {
    output: parseModelJsonObject(jsonText),
    rawText: text,
  }
}

async function detectExamStructureAndPendingByDoubao(params: {
  imageDataUrls: string[]
  examTitle: string
  examType: string
  hasAnswer: boolean
  currentMajorTitle: string
  currentMinorTitle: string
  currentStructureChapterId: string
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  pendingContinueQuestionKey: string | null
  crossPageContext?: string
}) {
  const {
    imageDataUrls,
    examTitle,
    examType,
    hasAnswer,
    currentMajorTitle,
    currentMinorTitle,
    currentStructureChapterId,
    mode,
    processingStartQuestionKey = null,
    pendingContinueQuestionKey,
    crossPageContext = '',
  } = params

  if (mode === 'cross_page_merge' && (imageDataUrls.length < 2 || imageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(`cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images, got ${imageDataUrls.length}`)
  }

  const instruction = [
    '你是试卷结构边界检测器。你只做结构切换与跨页判断，不生成题目 JSON 内容。',
    '上下文:',
    `- 试卷标题: ${examTitle}`,
    `- 试卷类型: ${examType}`,
    `- 是否有答案: ${hasAnswer ? 'true' : 'false'}`,
    `- 当前大题区标题: ${currentMajorTitle || 'null'}`,
    `- 当前小结构标题: ${currentMinorTitle || 'null'}`,
    `- 当前结构 chapterId: ${currentStructureChapterId || 'null'}`,
    `- 处理模式: ${mode}`,
    `- 当前处理起点题号: ${processingStartQuestionKey || 'null'}`,
    `- 跨页续题标记: ${pendingContinueQuestionKey || 'null'}`,
    crossPageContext ? `跨页补充上下文: ${crossPageContext}` : '',
    '规则:',
    '1) 试卷结构最多两层：顶层大题区，例如“一、填空题”；二级小结构，例如“1.1”。',
    '2) 如果最后一页没有出现新的顶层或二级结构，仍要返回最后一页实际生效的结构标题；不要返回 null。',
    '3) 只按输入队列最后一页判断当前结构；前面的页只用于补题。',
    '4) hasExtractableQuestions 判断的是：从起点开始，到当前队列最后一页为止，是否已经出现至少一道完整可导入的顶层大题。',
    '5) needNextPage 只判断当前处理起点题号那道题是否仍需下一页，不要用最后一题替代它。',
    '6) continueQuestionKey 只判断整个输入队列里按阅读顺序最后出现的那道顶层大题；若它还需下一页则返回它，否则返回 null。',
    '7) continueQuestionKey 只能写成“第几题”或“结构标题 | 第几题”这类自然文本，禁止输出 q_/ch_ id。',
    hasAnswer
      ? '8) 有答案时，长题若只露出半个答案或某个小问答案明显未结束，仍判为跨页未完。'
      : '8) 无答案时，不要因为 standardAnswer 为空就判定题目未完；只根据题干与小问是否完整显示判断。',
    '严格输出 JSON（不要 markdown，不要解释）：',
    '{',
    '  "structure": {',
    '    "majorTitle": "string",',
    '    "minorTitle": "string or null",',
    '    "reason": "string"',
    '  },',
    '  "question": {',
    '    "needNextPage": true/false,',
    '    "continueQuestionKey": "string or null",',
    '    "hasExtractableQuestions": true/false,',
    '    "reason": "string"',
    '  }',
    '}',
  ].filter(Boolean).join('\n')

  const { output, rawText } = await requestExamJsonObject({
    instruction,
    imageDataUrls,
  })
  const structureNode =
    output.structure && typeof output.structure === 'object' ? (output.structure as Record<string, unknown>) : {}
  const questionNode =
    output.question && typeof output.question === 'object' ? (output.question as Record<string, unknown>) : {}

  return {
    structure: {
      majorTitle: normalizeTitle(String(structureNode.majorTitle || '')),
      minorTitle: normalizeTitle(String(structureNode.minorTitle || '')),
      reason: String(structureNode.reason || ''),
    },
    question: {
      needNextPage: questionNode.needNextPage === true,
      continueQuestionKey:
        typeof questionNode.continueQuestionKey === 'string' && questionNode.continueQuestionKey.trim()
          ? questionNode.continueQuestionKey.trim()
          : null,
      hasExtractableQuestions:
        questionNode.hasExtractableQuestions === true || questionNode.hasExtractableQuestion === true,
      reason: typeof questionNode.reason === 'string' ? questionNode.reason : '',
      rawText,
    } as QuestionBoundaryResult,
  }
}

async function detectExamLastQuestionContinuationWithLookaheadByDoubao(params: {
  queueImageDataUrls: string[]
  lookaheadImageDataUrl: string
  examTitle: string
  examType: string
  hasAnswer: boolean
  currentMajorTitle: string
  currentMinorTitle: string
  continueQuestionKey: string
}) {
  const {
    queueImageDataUrls,
    lookaheadImageDataUrl,
    examTitle,
    examType,
    hasAnswer,
    currentMajorTitle,
    currentMinorTitle,
    continueQuestionKey,
  } = params

  const instruction = [
    '你是试卷跨页续题复核器。你只判断当前输入队列的最后一题是否延续到下一页预读图。',
    '上下文:',
    `- 试卷标题: ${examTitle}`,
    `- 试卷类型: ${examType}`,
    `- 是否有答案: ${hasAnswer ? 'true' : 'false'}`,
    `- 当前结构: ${buildExamStructureLabel(currentMajorTitle, currentMinorTitle)}`,
    `- 当前待复核题号: ${continueQuestionKey}`,
    '规则:',
    '1) 只判断当前待复核题号在预读页里是否继续出现。',
    hasAnswer
      ? '2) 有答案时，答案链未闭合也算继续。'
      : '2) 无答案时，只根据题干和小问链是否继续出现判断，不要因为没有答案就判继续。',
    '3) 若继续到预读页，返回当前题号；若未继续，返回 null。',
    '严格输出 JSON：{"continueQuestionKey":"string or null","reason":"string"}',
  ].join('\n')

  const { output } = await requestExamJsonObject({
    instruction,
    imageDataUrls: [...queueImageDataUrls, lookaheadImageDataUrl],
  })

  return {
    continueQuestionKey:
      typeof output.continueQuestionKey === 'string' && output.continueQuestionKey.trim()
        ? output.continueQuestionKey.trim()
        : null,
    reason: typeof output.reason === 'string' ? output.reason : '',
  }
}

async function detectExamStructureAndQuestionsByDoubao(params: {
  imageDataUrls: string[]
  examTitle: string
  examType: string
  hasAnswer: boolean
  currentMajorTitle: string
  currentMinorTitle: string
  currentStructureChapterId: string
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  extractEndBeforeQuestionKey?: string | null
}) {
  const {
    imageDataUrls,
    examTitle,
    examType,
    hasAnswer,
    currentMajorTitle,
    currentMinorTitle,
    currentStructureChapterId,
    mode,
    processingStartQuestionKey = null,
    extractEndBeforeQuestionKey = null,
  } = params

  const instruction = [
    '你是试卷结构化提取器，一次同时输出 structure 与 question 两部分 JSON。',
    '上下文:',
    `- 试卷标题: ${examTitle}`,
    `- 试卷类型: ${examType}`,
    `- 是否有答案: ${hasAnswer ? 'true' : 'false'}`,
    `- 当前大题区标题: ${currentMajorTitle || 'null'}`,
    `- 当前小结构标题: ${currentMinorTitle || 'null'}`,
    `- 当前结构 chapterId: ${currentStructureChapterId || 'null'}`,
    `- 处理模式: ${mode}`,
    '本轮提取范围（严格遵守）:',
    `{ "startQuestionKey": ${JSON.stringify(processingStartQuestionKey || null)}, "endBeforeQuestionKey": ${JSON.stringify(extractEndBeforeQuestionKey || null)} }`,
    '结构规则:',
    '1) 试卷结构最多两层：顶层大题区（如“一、填空题”）与二级小结构（如“1.1”）。',
    '2) 只按输入队列最后一页决定 structure.majorTitle / structure.minorTitle。',
    '3) 题目若位于当前大题区下但没有二级小结构，chapterId 写成 ch_<顶层序号>，例如 ch_1。',
    '4) 题目若位于某个二级小结构下，chapterId 写成 ch_<顶层序号>_<二级序号>，例如 ch_1_2。',
    '5) 若当前队列中出现结构切换，切换前题目保持旧结构 chapterId，切换后题目改用新结构 chapterId。',
    '题目规则:',
    '1) 只提取给定范围内在图片上完整可见的顶层大题；未完整显示的题不要输出。',
    '2) startQuestionKey=null 时，从队列第一页实际出现的第一个顶层大题开始。',
    '3) endBeforeQuestionKey!=null 时，只提取到该题之前；该题本身严禁输出。',
    '4) endBeforeQuestionKey=null 时，必须提取从 startQuestionKey 开始到当前队列末尾之间所有完整顶层大题。',
    '5) question.title 必须使用“当前结构标题 + 第几题”的格式；不要生成教材式标题。',
    hasAnswer
      ? '6) 有答案时，standardAnswer.text 必须尽量贴近图片原文，不得补写图片中不可见的答案。'
      : '6) 本次文档无答案，所有 standardAnswer 字段必须保留但内容置空。',
    ...buildSharedQuestionContentRuleLines(7),
    ...buildSharedQuestionStructureInstructionLines(hasAnswer),
    '严格输出 JSON（不要 markdown，不要解释）：',
    '{',
    '  "structure": {',
    '    "majorTitle": "string",',
    '    "minorTitle": "string or null",',
    '    "reason": "string"',
    '  },',
    '  "question": {',
    '    "questionsToUpsert": [ ...question objects... ],',
    '    "reason": "string"',
    '  }',
    '}',
  ].join('\n')

  const { output, rawText } = await requestExamJsonObject({
    instruction,
    imageDataUrls,
  })
  const structureNode =
    output.structure && typeof output.structure === 'object' ? (output.structure as Record<string, unknown>) : {}
  const questionNode =
    output.question && typeof output.question === 'object' ? (output.question as Record<string, unknown>) : {}

  return {
    structure: {
      majorTitle: normalizeTitle(String(structureNode.majorTitle || '')),
      minorTitle: normalizeTitle(String(structureNode.minorTitle || '')),
      needReprocessSameImage: false,
      reason: typeof structureNode.reason === 'string' ? structureNode.reason : '',
    },
    question: {
      questionsToUpsert: Array.isArray(questionNode.questionsToUpsert) ? questionNode.questionsToUpsert : [],
      needNextPage: false,
      continueQuestionKey: null,
      reason: typeof questionNode.reason === 'string' ? questionNode.reason : '',
      rawText,
    },
  } as ExamCombinedExtractResult
}

function resolveExamQuestionStructureContext(params: {
  rawQuestion: Record<string, unknown>
  currentContext: ExamStructureContext | null
  latestContext: ExamStructureContext
}) {
  const { rawQuestion, currentContext, latestContext } = params
  const rawChapterId = String(rawQuestion.chapterId || '').trim()
  if (!rawChapterId) {
    return currentContext || latestContext
  }
  if (currentContext && rawChapterId === currentContext.chapterId) {
    return currentContext
  }
  return latestContext
}

function summarizeExamQuestionResult(
  pending: boolean,
  reason: string,
  processingStartQuestionKey: string | null,
  pendingContinueQuestionKey: string | null,
  pendingPageLabels: string[],
  upsertedCount: number,
  questionsCount: number,
  rawText: string,
) {
  if (pending) {
    return {
      pending: true,
      reason,
      processingStartQuestionKey,
      nextStartQuestionKey: pendingContinueQuestionKey || processingStartQuestionKey || null,
      continueQuestionKey: pendingContinueQuestionKey,
      pendingPagesCount: pendingPageLabels.length,
      pendingPageLabels,
      upsertedCount,
      rawText,
    }
  }

  return {
    pending: false,
    reason,
    processingStartQuestionKey,
    nextStartQuestionKey: null,
    pendingPagesCount: 0,
    pendingPageLabels: [],
    upsertedCount,
    questionsCount,
    rawText,
  }
}

export async function processExamSessionImage(params: {
  sessionId: string
  imageDataUrl: string
  imageLabel?: string
  lookaheadImageDataUrl?: string
  lookaheadImageLabel?: string
}) {
  const {
    sessionId,
    imageDataUrl,
    imageLabel = '',
    lookaheadImageDataUrl = '',
  } = params

  const session = examSessions.get(sessionId)
  if (!session) {
    throw new Error('Exam session not found, please init first')
  }

  const questionSession =
    examQuestionSessions.get(sessionId) ||
    ({
      sessionId,
      jsonFilePath: session.jsonFilePath,
      examTitle: session.examTitle,
      examType: session.examType,
      hasAnswer: session.hasAnswer,
      currentMajorTitle: session.currentMajorTitle,
      currentMinorTitle: session.currentMinorTitle,
      currentStructureChapterId: '',
      pendingPageDataUrls: [],
      pendingPageLabels: [],
      pendingContinueQuestionKey: null,
      processingStartQuestionKey: null,
      pendingReason: null,
      pendingUpsertedCount: 0,
      updatedAt: new Date().toISOString(),
    } as ExamQuestionSessionState)

  const payload = await loadTextbookJson(session.jsonFilePath)
  if (getPayloadDocumentType(payload) !== 'exam') {
    throw new Error('Target json is not an exam payload')
  }

  const pendingPageDataUrls = [...questionSession.pendingPageDataUrls]
  const pendingPageLabels = [...questionSession.pendingPageLabels]
  const mode = pendingPageDataUrls.length ? 'cross_page_merge' : 'single_page'
  const questionImageDataUrls =
    mode === 'cross_page_merge' ? [...pendingPageDataUrls, imageDataUrl] : [imageDataUrl]
  const questionImageLabels =
    mode === 'cross_page_merge' ? [...pendingPageLabels, imageLabel || 'current'] : [imageLabel || 'current']
  const processingStartQuestionKey =
    questionSession.processingStartQuestionKey || questionSession.pendingContinueQuestionKey || null

  const boundaryDetect = await detectExamStructureAndPendingByDoubao({
    imageDataUrls: questionImageDataUrls,
    examTitle: session.examTitle,
    examType: session.examType,
    hasAnswer: session.hasAnswer,
    currentMajorTitle: questionSession.currentMajorTitle,
    currentMinorTitle: questionSession.currentMinorTitle,
    currentStructureChapterId: questionSession.currentStructureChapterId,
    mode,
    processingStartQuestionKey,
    pendingContinueQuestionKey: questionSession.pendingContinueQuestionKey,
    crossPageContext: buildExamCrossPageContext({
      processingStartQuestionKey,
      pendingPagesCount: pendingPageDataUrls.length,
      pendingPageLabels,
    }),
  })

  let effectiveContinueQuestionKey = boundaryDetect.question.continueQuestionKey
  let boundaryLookaheadReason = ''
  if (lookaheadImageDataUrl && effectiveContinueQuestionKey) {
    try {
      const lookaheadDetect = await detectExamLastQuestionContinuationWithLookaheadByDoubao({
        queueImageDataUrls: questionImageDataUrls,
        lookaheadImageDataUrl,
        examTitle: session.examTitle,
        examType: session.examType,
        hasAnswer: session.hasAnswer,
        currentMajorTitle: boundaryDetect.structure.majorTitle || questionSession.currentMajorTitle,
        currentMinorTitle: boundaryDetect.structure.minorTitle || questionSession.currentMinorTitle,
        continueQuestionKey: effectiveContinueQuestionKey,
      })
      effectiveContinueQuestionKey = lookaheadDetect.continueQuestionKey
      boundaryLookaheadReason = lookaheadDetect.reason || ''
    } catch {
      // Ignore lookahead failures and keep the first boundary result.
    }
  }

  let latestContext: ExamStructureContext | null = null
  const boundaryMajorTitle = boundaryDetect.structure.majorTitle || questionSession.currentMajorTitle
  const boundaryMinorTitle = boundaryDetect.structure.minorTitle || ''
  if (boundaryMajorTitle) {
    latestContext = ensureExamStructureContext(payload, boundaryMajorTitle, boundaryMinorTitle)
  }

  const currentContext =
    questionSession.currentMajorTitle
      ? ensureExamStructureContext(payload, questionSession.currentMajorTitle, questionSession.currentMinorTitle)
      : latestContext

  let normalizedQuestions: QuestionItem[] = []
  let extractReason = ''
  let extractRawText = boundaryDetect.question.rawText
  let pendingReason = boundaryDetect.question.reason

  if (boundaryDetect.question.hasExtractableQuestions) {
    const extractDetect = await detectExamStructureAndQuestionsByDoubao({
      imageDataUrls: questionImageDataUrls,
      examTitle: session.examTitle,
      examType: session.examType,
      hasAnswer: session.hasAnswer,
      currentMajorTitle: questionSession.currentMajorTitle,
      currentMinorTitle: questionSession.currentMinorTitle,
      currentStructureChapterId: questionSession.currentStructureChapterId,
      mode,
      processingStartQuestionKey,
      extractEndBeforeQuestionKey: effectiveContinueQuestionKey || null,
    })

    extractReason = extractDetect.question.reason || ''
    extractRawText = extractDetect.question.rawText || extractRawText
    const extractMajorTitle = extractDetect.structure.majorTitle || boundaryMajorTitle
    const extractMinorTitle = extractDetect.structure.minorTitle || boundaryMinorTitle
    if (extractMajorTitle) {
      latestContext = ensureExamStructureContext(payload, extractMajorTitle, extractMinorTitle)
    }

    normalizedQuestions = (Array.isArray(extractDetect.question.questionsToUpsert)
      ? extractDetect.question.questionsToUpsert
      : []
    )
      .map((item) => {
        const rawQuestion = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
        if (!rawQuestion) {
          return null
        }
        const targetContext = resolveExamQuestionStructureContext({
          rawQuestion,
          currentContext,
          latestContext: latestContext || currentContext || ensureExamStructureContext(payload, boundaryMajorTitle, boundaryMinorTitle),
        })
        const scopeTitle = targetContext.minorTitle || targetContext.majorTitle
        return normalizeQuestionItem(rawQuestion, targetContext.chapterId, scopeTitle, {
          expectAnswer: session.hasAnswer,
        })
      })
      .filter(Boolean) as QuestionItem[]

    const integrityIssue = detectQuestionIntegrityIssue(normalizedQuestions, {
      expectAnswer: session.hasAnswer,
    })
    if (integrityIssue) {
      normalizedQuestions = normalizedQuestions.slice(0, integrityIssue.index)
      effectiveContinueQuestionKey = integrityIssue.continueKey
      pendingReason = integrityIssue.reason
    }
  }

  if (normalizedQuestions.length) {
    upsertQuestionsById(payload, normalizedQuestions)
  }

  let nextPendingPageDataUrls: string[] = []
  let nextPendingPageLabels: string[] = []
  let nextProcessingStartQuestionKey: string | null = null
  let pending = false

  if (!boundaryDetect.question.hasExtractableQuestions) {
    pending = true
    nextPendingPageDataUrls = [...questionImageDataUrls].slice(-MAX_PENDING_QUEUE_PAGES)
    nextPendingPageLabels = [...questionImageLabels].slice(-MAX_PENDING_QUEUE_PAGES)
    nextProcessingStartQuestionKey = processingStartQuestionKey
  } else if (effectiveContinueQuestionKey) {
    pending = true
    nextPendingPageDataUrls = [imageDataUrl]
    nextPendingPageLabels = [imageLabel || 'current']
    nextProcessingStartQuestionKey = effectiveContinueQuestionKey
  }

  await saveTextbookJson(session.jsonFilePath, payload)

  const activeContext = latestContext || currentContext
  session.currentMajorTitle = activeContext?.majorTitle || session.currentMajorTitle
  session.currentMinorTitle = activeContext?.minorTitle || ''
  session.updatedAt = new Date().toISOString()
  examSessions.set(sessionId, session)

  questionSession.currentMajorTitle = session.currentMajorTitle
  questionSession.currentMinorTitle = session.currentMinorTitle
  questionSession.currentStructureChapterId = activeContext?.chapterId || questionSession.currentStructureChapterId
  questionSession.pendingPageDataUrls = nextPendingPageDataUrls
  questionSession.pendingPageLabels = nextPendingPageLabels
  questionSession.pendingContinueQuestionKey = pending ? effectiveContinueQuestionKey : null
  questionSession.processingStartQuestionKey = nextProcessingStartQuestionKey
  questionSession.pendingReason = pending ? pendingReason : null
  questionSession.pendingUpsertedCount = normalizedQuestions.length
  questionSession.updatedAt = new Date().toISOString()
  examQuestionSessions.set(sessionId, questionSession)

  return {
    message: 'success',
    sessionId,
    jsonFilePath: session.jsonFilePath,
    examTitle: session.examTitle,
    examType: session.examType,
    hasAnswer: session.hasAnswer,
    currentMajorTitle: session.currentMajorTitle,
    currentMinorTitle: session.currentMinorTitle,
    currentStructureChapterId: questionSession.currentStructureChapterId,
    chaptersCount: payload.chapters.length,
    questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
    structure: {
      majorTitle: session.currentMajorTitle,
      minorTitle: session.currentMinorTitle,
      label: buildExamStructureLabel(session.currentMajorTitle, session.currentMinorTitle),
      boundaryReason: boundaryDetect.structure.reason,
      boundaryLookaheadReason,
    },
    question: summarizeExamQuestionResult(
      pending,
      pending ? pendingReason : extractReason || boundaryDetect.question.reason,
      processingStartQuestionKey,
      pending ? effectiveContinueQuestionKey : null,
      nextPendingPageLabels,
      normalizedQuestions.length,
      Array.isArray(payload.questions) ? payload.questions.length : 0,
      extractRawText,
    ),
  }
}

export async function initExamSession(params: {
  jsonFilePath: string
}) {
  const { jsonFilePath } = params
  const payload = await loadTextbookJson(jsonFilePath)
  const meta = getPayloadSourceMeta(payload)
  if (meta.documentType !== 'exam' || !payload.exam) {
    throw new Error('Target json is not an exam payload')
  }

  const sessionId = batchId()
  const session: ExamSessionState = {
    sessionId,
    jsonFilePath,
    examTitle: meta.title,
    examType: payload.exam.examType,
    hasAnswer: payload.exam.hasAnswer,
    currentMajorTitle: '',
    currentMinorTitle: '',
    updatedAt: new Date().toISOString(),
  }

  examSessions.set(sessionId, session)
  examQuestionSessions.set(sessionId, {
    sessionId,
    jsonFilePath,
    examTitle: meta.title,
    examType: payload.exam.examType,
    hasAnswer: payload.exam.hasAnswer,
    currentMajorTitle: '',
    currentMinorTitle: '',
    currentStructureChapterId: '',
    pendingPageDataUrls: [],
    pendingPageLabels: [],
    pendingContinueQuestionKey: null,
    processingStartQuestionKey: null,
    pendingReason: null,
    pendingUpsertedCount: 0,
    updatedAt: new Date().toISOString(),
  })

  return {
    message: 'success',
    sessionId,
    jsonFilePath,
    examTitle: meta.title,
    examType: payload.exam.examType,
    hasAnswer: payload.exam.hasAnswer,
    currentMajorTitle: '',
    currentMinorTitle: '',
    currentStructureChapterId: '',
    chaptersCount: payload.chapters.length,
    questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
  }
}
