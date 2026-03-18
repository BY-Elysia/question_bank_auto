import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  ARK_API_KEY,
  ARK_MODEL,
  MAX_PENDING_QUEUE_PAGES,
  READ_RESULTS_DIR,
} from './config'
import { getArkApiKeyOverride } from './ark-request-context'
import {
  type ArkResponsesPrefixUsage,
  requestArkResponsesPrefixCompletion,
} from './ark-responses-prefix-experiment-service'
import {
  buildCanonicalQuestionTitle,
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
  chapterSessions,
  detectQuestionIntegrityIssue,
  ensureSectionChapter,
  ensureTopChapter,
  extractArkText,
  extractFirstJsonObject,
  extractQuestionNoFromId,
  extractQuestionNoFromText,
  loadTextbookJson,
  normalizeQuestionItem,
  normalizeTitle,
  parseModelJsonObject,
  questionSessions,
  regenerateModelJsonWithImagesByDoubao,
  repairModelJsonByDoubao,
  requestArkRawWithRetry,
  saveTextbookJson,
} from './question-bank-service'
import type {
  ChapterDetectResult,
  CombinedExtractResult,
  LastQuestionLookaheadResult,
  QuestionBoundaryResult,
  QuestionExtractResult,
  QuestionGroupChild,
  QuestionItem,
  TextbookJsonPayload,
} from './types'

type PrefixCacheDebugInfo = {
  seedResponseId: string
  requestResponseId: string
  seedSource: string
  usage: ArkResponsesPrefixUsage
}

type BoundaryDetectWithPrefixCacheResult = {
  question: QuestionBoundaryResult
  prefixCacheDebug: PrefixCacheDebugInfo
}

type CombinedExtractWithPrefixCacheResult = CombinedExtractResult & {
  prefixCacheDebug: PrefixCacheDebugInfo
}

const EXPERIMENT_MODEL_KEY = String(process.env.ARK_RESPONSES_MODEL || ARK_MODEL).trim()
  || ARK_MODEL

const BOUNDARY_PREFIX_CACHE_KEY = `question_bank_boundary_prefix_v1:${EXPERIMENT_MODEL_KEY}`
const EXTRACT_PREFIX_CACHE_KEY = `question_bank_extract_prefix_v1:${EXPERIMENT_MODEL_KEY}`

function getEffectiveArkApiKey() {
  return getArkApiKeyOverride() || ARK_API_KEY
}

function normalizeDigits(value: string) {
  return value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248))
}

function extractQuestionNoFromPrompt(promptText: string) {
  const normalized = normalizeDigits(String(promptText || ''))
  const match = normalized.match(/^\s*[\(（]?(\d+)[\)）]?/)
  return match?.[1] || ''
}

function extractSubQuestionNoFromQuestionId(questionId: string) {
  const normalized = normalizeDigits(String(questionId || ''))
  const match = normalized.match(/^q_(\d+)_(\d+)_(\d+)_(\d+)$/)
  return match?.[4] || ''
}

function resolveContinueQuestionKey(continueQuestionKey: string | null) {
  const direct = String(continueQuestionKey || '').trim()
  if (direct) return direct
  return ''
}

function extractDistinctQuestionNos(value: string) {
  const matches = [...normalizeDigits(String(value || '')).matchAll(/第\s*(\d+)\s*题/g)]
  return [...new Set(matches.map((match) => Number(match[1])).filter((num) => Number.isFinite(num) && num > 0))]
}

function topQuestionNosFromItems(items: QuestionItem[]) {
  return [...new Set(
    items
      .map((item) => Number(extractQuestionNoFromText(item.title) || extractQuestionNoFromId(item.questionId) || 0))
      .filter((num) => Number.isFinite(num) && num > 0),
  )].sort((a, b) => a - b)
}

function detectExtractorRangeMismatch(params: {
  boundaryReason: string
  processingStartQuestionKey: string | null
  extractEndBeforeQuestionKey: string | null
  extractReason?: string
  normalizedQuestions: QuestionItem[]
}) {
  const {
    boundaryReason,
    processingStartQuestionKey,
    extractEndBeforeQuestionKey,
    extractReason = '',
    normalizedQuestions,
  } = params

  if (extractEndBeforeQuestionKey) {
    return { shouldRetry: false, reason: '' }
  }

  const startNo = Number(extractQuestionNoFromText(processingStartQuestionKey || '') || 0)
  if (!startNo) {
    return { shouldRetry: false, reason: '' }
  }

  const boundaryNos = extractDistinctQuestionNos(boundaryReason).filter((num) => num >= startNo)
  const returnedNos = topQuestionNosFromItems(normalizedQuestions)
  if (!boundaryNos.length || !returnedNos.length) {
    return { shouldRetry: false, reason: '' }
  }

  const onlyReturnedStart = returnedNos.length === 1 && returnedNos[0] === startNo
  const boundaryMentionsLaterQuestion = boundaryNos.some((num) => num > startNo)
  if (onlyReturnedStart && boundaryMentionsLaterQuestion) {
    return {
      shouldRetry: true,
      reason: `边界判断认为起点题之后仍有完整题可提取（${boundaryNos.join(', ')}），但提取结果只返回了起点题第${startNo}题。`,
    }
  }

  const extractReasonNormalized = normalizeDigits(String(extractReason || ''))
  if (
    /只输出了起始题|仅输出起点题|只返回起点题/.test(extractReasonNormalized) &&
    boundaryMentionsLaterQuestion
  ) {
    return {
      shouldRetry: true,
      reason: `提取器理由显示仅围绕起点题工作，但边界判断说明后续仍有完整题可提取（${boundaryNos.join(', ')}）。`,
    }
  }

  return { shouldRetry: false, reason: '' }
}

function shouldClearTrailingPendingAfterExtraction(items: QuestionItem[], continueKey: string | null) {
  if (!continueKey || !items.length) {
    return false
  }
  const continueNo = Number(extractQuestionNoFromText(continueKey) || 0)
  if (!continueNo) {
    return false
  }
  const topNos = items
    .map((item) => Number(extractQuestionNoFromText(item.title) || extractQuestionNoFromId(item.questionId) || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!topNos.length) {
    return false
  }
  const lastNo = topNos[topNos.length - 1]
  const hasMatched = topNos.includes(continueNo)
  const hasLater = topNos.some((value) => value > continueNo)
  return hasMatched && !hasLater && lastNo === continueNo
}

function buildCrossPageContext(params: {
  processingStartQuestionKey: string | null
  pendingContinueQuestionKey: string | null
  pendingReason: string | null
  pendingUpsertedCount: number
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
    '- 如果当前处理起点题号为 null，则从队列第一页图片中实际出现的第一个题开始。',
    '- 你应先判断“从当前处理起点开始，哪些题已经完整可入库”，再判断“最后一张图的最后一题是否跨页”。',
  ].join(' ')
}

function rewriteQuestionTitlesByResolvedChapter(payload: TextbookJsonPayload, items: QuestionItem[]) {
  return items.map((item) => {
    const sectionTitle = payload.chapters.find((chapter) => chapter.chapterId === item.chapterId)?.title || ''
    const mainQuestionNo = extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title)
    const subQuestionNo = item.nodeType === 'LEAF' ? extractSubQuestionNoFromQuestionId(item.questionId) : ''
    if (item.nodeType === 'GROUP') {
      return {
        ...item,
        title: buildCanonicalQuestionTitle(sectionTitle, mainQuestionNo) || item.title,
        children: item.children.map((child) => {
          const childSubQuestionNo =
            extractSubQuestionNoFromQuestionId(child.questionId) ||
            extractQuestionNoFromPrompt(child.prompt.text) ||
            String(child.orderNo)
          return {
            ...child,
            title:
              buildCanonicalQuestionTitle(sectionTitle, mainQuestionNo, childSubQuestionNo) ||
              (child as QuestionGroupChild).title,
          }
        }),
      } as QuestionItem
    }
    return {
      ...item,
      title: buildCanonicalQuestionTitle(sectionTitle, mainQuestionNo, subQuestionNo) || item.title,
    } as QuestionItem
  })
}

function upsertQuestionsById(payload: TextbookJsonPayload, incoming: QuestionItem[]) {
  const existing = Array.isArray(payload.questions) ? [...payload.questions] : []
  const indexMap = new Map<string, number>()
  existing.forEach((item, index) => {
    const row = item as Record<string, unknown>
    const rawId = typeof row.questionId === 'string' ? row.questionId.trim() : ''
    const id = rawId
    if (id) {
      row.questionId = id
      indexMap.set(id, index)
      if (rawId && rawId !== id) {
        indexMap.set(rawId, index)
      }
    }
  })

  for (const item of incoming) {
    const idx = indexMap.get(item.questionId)
    if (idx === undefined) {
      existing.push(item)
      indexMap.set(item.questionId, existing.length - 1)
    } else {
      existing[idx] = item
    }
  }

  payload.questions = existing
}

function collectPendingReviewLogs(questions: QuestionItem[]) {
  const logs: Array<Record<string, string>> = []
  const marker = '【待校对】'
  for (const item of questions) {
    if (item.nodeType === 'GROUP') {
      if (item.stem.text.includes(marker)) {
        logs.push({ questionId: item.questionId, path: 'stem.text', text: item.stem.text })
      }
      for (const child of item.children) {
        if (child.prompt.text.includes(marker)) {
          logs.push({ questionId: child.questionId, path: 'prompt.text', text: child.prompt.text })
        }
        if (child.standardAnswer.text.includes(marker)) {
          logs.push({ questionId: child.questionId, path: 'standardAnswer.text', text: child.standardAnswer.text })
        }
      }
    } else {
      if (item.prompt.text.includes(marker)) {
        logs.push({ questionId: item.questionId, path: 'prompt.text', text: item.prompt.text })
      }
      if (item.standardAnswer.text.includes(marker)) {
        logs.push({ questionId: item.questionId, path: 'standardAnswer.text', text: item.standardAnswer.text })
      }
    }
  }
  return logs
}

async function appendPendingReviewLogs(sessionId: string, logs: Array<Record<string, string>>) {
  if (!logs.length) return
  const logFile = path.join(READ_RESULTS_DIR, 'pending_review_questions.jsonl')
  const lines = logs.map((item) =>
    JSON.stringify({
      ts: new Date().toISOString(),
      sessionId,
      ...item,
    }),
  )
  await fsp.appendFile(logFile, `${lines.join('\n')}\n`, { encoding: 'utf8' })
}

function buildBoundarySharedInstruction() {
  return [
    '你是教材页边界检测器。你只做跨页边界判断，不处理章节/小节切换，也不生成题目 JSON 内容。',
    '下面动态输入会在每次请求中单独提供：当前章标题、当前小节标题、当前小节 chapterId、处理模式、当前处理起点题号、跨页续题标记、跨页补充上下文，以及按顺序传入的图片。',
    '要求:',
    '1) 只输出边界判断 JSON，不要输出题干、答案、rubric。',
    '2) 当前处理起点题号为 null 时，表示从队列第一页实际出现的第一个顶层大题开始。',
    '3) hasExtractableQuestions 判断的是：从起点开始，到当前队列最后一页为止，是否已经出现至少一道完整可导入的顶层大题。',
    '4) needNextPage 只判断“当前处理起点题号”对应那道题是否还需要下一页；不要用最后一题替代它。',
    '5) continueQuestionKey 只判断“当前输入图片队列中，按阅读顺序实际出现的最后一道顶层大题”是谁；它不是当前章的最后一题，不是当前小节的最后一题，也不是当前处理起点那道题，除非这道题确实就是整组图片里最后出现的那一道题。',
    '6) 如果最后一页发生了小节或章节切换，必须先根据图片实际内容判断切换后最后出现的顶层大题是谁，再决定 continueQuestionKey；不能因为起点题来自旧小节，就把旧小节那道题误当成整组图片里的最后一题。',
    '7) 如果这道“整组图片里最后出现的顶层大题”还要续到下一页，则 continueQuestionKey 返回它；否则返回 null。',
    '8) continueQuestionKey 不能是 q/ch id，也不能是小题号；格式必须是“章标题 | 小节标题 | 第几题”。若最后一页切到新小节，则用新小节标题。',
    '9) 对长题必须核对小问链和答案链是否真正闭合；不能只看页面末尾像是结束了就返回不跨页。',
    '10) hasExtractableQuestions=true 与 needNextPage=true 可以同时成立；这表示起点题还没补完，但当前队列里已经有别的完整题可导入。',
    '11) 例1：起点=第2题，当前队列里第2题补完，后面第3题完整，整组图片里最后出现的顶层大题是第4题且它跨页 => hasExtractableQuestions=true, needNextPage=false, continueQuestionKey=第4题。',
    '12) 例2：起点=第6题，当前队列里第6题补完，后面第7题完整，且整组图片里最后出现的顶层大题也已结束 => hasExtractableQuestions=true, needNextPage=false, continueQuestionKey=null。',
    '13) 例3：上半仍是习题8.1第8题，下半已切到习题8.2第1题，且整组图片最后出现的顶层大题是习题8.2第1题，则 continueQuestionKey 必须是“第八章 不定积分 | 习题8.2 | 第1题”，绝不能继续返回习题8.1第8题。',
    '14) 只有在你有清晰证据证明起点题已经闭合时，needNextPage 才能为 false。',
    '严格输出 JSON（不要 markdown，不要解释）：',
    '{',
    '  "question": {',
    '    "needNextPage": true/false,',
    '    "continueQuestionKey": "string or null",',
    '    "hasExtractableQuestions": true/false',
    '  }',
    '}',
  ].join('\n')
}

function buildBoundaryDynamicInstruction(params: {
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  pendingContinueQuestionKey?: string | null
  crossPageContext?: string
}) {
  const {
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    mode,
    processingStartQuestionKey = null,
    pendingContinueQuestionKey = null,
    crossPageContext = '',
  } = params

  return [
    '下面是本轮动态上下文，请基于这些上下文和随后附带的图片做判断。',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- 处理模式: ${mode}`,
    `- 当前处理起点题号: ${processingStartQuestionKey || 'null'}`,
    `- 跨页续题标记: ${pendingContinueQuestionKey || 'null'}`,
    crossPageContext ? `- 跨页补充上下文: ${crossPageContext}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildExtractSharedInstruction() {
  return [
    '你是教材结构化提取器，一次同时输出 chapter 与 question 两部分 JSON。',
    '下面动态输入会在每次请求中单独提供：当前章标题、当前小节标题、当前小节 chapterId、afterSwitchMode、处理模式、本轮提取范围 start/end key、可选 retryHint，以及按顺序传入的图片。',
    '章节规则:',
    '1) 默认按当前章标题和当前小节标题编号。',
    '2) 章节/小节切换只按输入队列的最后一页判断；前面的页只用于补题。',
    '3) 最后一页未出现新章节/小节标题，则 chapterTitle/sectionTitle 返回 null。',
    '4) 最后一页上半仍属当前小节、下半才切到新小节时，切换前题目保持当前小节编号，切换后题目改用新小节编号，并返回 switchSectionTitle。',
    '5) 最后一页中途切到新章节或新小节时，切换点之后题目改用新章/新小节编号，并如实写入 chapter 字段，供后端更新 chapters 树。',
    '6) chapter.chapterTitle 只能填写纯章标题，例如“第九章 定积分”；chapter.sectionTitle 和 switchSectionTitle 只能填写纯小节标题，例如“习题9.1”。',
    '7) chapter 字段中严禁输出“章标题 | 小节标题”这类组合串；这种组合格式只允许用于题目定位字段，不允许用于章节树字段。',
    '题目规则:',
    '1) 只提取给定范围内在图片上完整可见的顶层大题；未完整显示的题不要输出。',
    '2) startQuestionKey=null 时，从队列第一页实际出现的第一个顶层大题开始。',
    '3) endBeforeQuestionKey!=null 时，只提取到该题之前；该题本身严禁输出。',
    '4) endBeforeQuestionKey=null 时，必须提取从 startQuestionKey 开始到当前队列末尾之间所有完整顶层大题；绝不能自行制造新的截止题号，也绝不能只提取起点题。',
    '5) startQuestionKey 与 endBeforeQuestionKey 指向同一道题时，不表示空范围；表示当前正在续这道题。若它在当前队列里已完整结束，就输出它；否则不要输出。',
    '6) 典型场景：起点=第2题，截止=第4题，当前队列里第2题已完整、后面第3题完整 => 必须同时输出第2题和第3题，不输出第4题。',
    '7) 典型场景：起点=第6题，截止=null，当前队列里第6题已完整、后面第7题完整 => 必须同时输出第6题和第7题。',
    ...buildSharedQuestionContentRuleLines(8),
    ...buildSharedQuestionStructureInstructionLines(),
    '严格输出 JSON（不要 markdown，不要解释）：',
    '{',
    '  "chapter": {',
    '    "chapterTitle": "string or null",',
    '    "sectionTitle": "string or null",',
    '    "switchSectionTitle": "string or null",',
    '    "needReprocessSameImage": true/false',
    '  },',
    '  "question": {',
    '    "questionsToUpsert": [ ...question objects... ]',
    '  }',
    '}',
  ].join('\n')
}

function buildExtractDynamicInstruction(params: {
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  afterSwitchMode: boolean
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  extractEndBeforeQuestionKey?: string | null
  retryHint?: string
}) {
  const {
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    afterSwitchMode,
    mode,
    processingStartQuestionKey = null,
    extractEndBeforeQuestionKey = null,
    retryHint = '',
  } = params

  return [
    '下面是本轮动态上下文，请基于这些上下文和随后附带的图片执行提取。',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- afterSwitchMode: ${afterSwitchMode ? 'true' : 'false'}`,
    `- 处理模式: ${mode}`,
    `- 提取范围: ${JSON.stringify({
      startQuestionKey: processingStartQuestionKey || null,
      endBeforeQuestionKey: extractEndBeforeQuestionKey || null,
    })}`,
    retryHint ? `- 重试提示: ${retryHint}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildImageContent(dataUrls: string[]) {
  return dataUrls.map((dataUrl) => ({
    type: 'input_image' as const,
    image_url: dataUrl,
  }))
}

async function parseModelOutputWithFallback(params: {
  text: string
  imageDataUrls: string[]
  originalInstruction: string
}) {
  const { text, imageDataUrls, originalInstruction } = params
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Model output is not JSON: ${text.slice(0, 500)}`)
  }

  try {
    return parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    try {
      return await regenerateModelJsonWithImagesByDoubao({
        imageDataUrls,
        originalInstruction,
        parseError,
        previousOutputText: text,
      })
    } catch (regenerateError) {
      const regenerateMsg = regenerateError instanceof Error ? regenerateError.message : String(regenerateError)
      try {
        return await repairModelJsonByDoubao({
          brokenOutputText: text,
          parseError: `${parseError}; regenerate=${regenerateMsg}`,
        })
      } catch (repairError) {
        const repairMsg = repairError instanceof Error ? repairError.message : String(repairError)
        throw new Error(
          `Model JSON parse+regen+repair failed: parse=${parseError}; regenerate=${regenerateMsg}; repair=${repairMsg}`,
        )
      }
    }
  }
}

async function detectChapterBoundaryAndPendingByDoubaoWithPrefixCache(params: {
  imageDataUrls: string[]
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  pendingContinueQuestionKey?: string | null
  crossPageContext?: string
}): Promise<BoundaryDetectWithPrefixCacheResult> {
  const {
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    mode,
    processingStartQuestionKey = null,
    pendingContinueQuestionKey = null,
    crossPageContext = '',
  } = params

  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }
  if (mode === 'cross_page_merge' && (imageDataUrls.length < 2 || imageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(`cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images, got ${imageDataUrls.length}`)
  }

  const sharedInstruction = buildBoundarySharedInstruction()
  const dynamicInstruction = buildBoundaryDynamicInstruction({
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    mode,
    processingStartQuestionKey,
    pendingContinueQuestionKey,
    crossPageContext,
  })
  const fullInstruction = `${sharedInstruction}\n\n${dynamicInstruction}`

  const result = await requestArkResponsesPrefixCompletion({
    key: BOUNDARY_PREFIX_CACHE_KEY,
    fixedResponseId: String(process.env.ARK_BOUNDARY_PREFIX_RESPONSE_ID || '').trim(),
    sharedInput: [
      { role: 'system', content: '你只输出合法 JSON。' },
      { role: 'user', content: sharedInstruction },
    ],
    requestInput: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: dynamicInstruction }, ...buildImageContent(imageDataUrls)],
      },
    ],
    temperature: 0,
  })

  const output = await parseModelOutputWithFallback({
    text: result.text,
    imageDataUrls,
    originalInstruction: fullInstruction,
  })

  const questionRaw =
    output.question && typeof output.question === 'object' ? (output.question as Record<string, unknown>) : {}

  return {
    question: {
      needNextPage: Boolean(questionRaw.needNextPage),
      continueQuestionKey:
        typeof questionRaw.continueQuestionKey === 'string' && questionRaw.continueQuestionKey.trim()
          ? questionRaw.continueQuestionKey.trim()
          : null,
      hasExtractableQuestions:
        questionRaw.hasExtractableQuestions === true || questionRaw.hasExtractableQuestion === true,
      reason: '',
      rawText: result.text,
    },
    prefixCacheDebug: {
      seedResponseId: result.seedResponseId,
      requestResponseId: result.responseId,
      seedSource: result.seedSource,
      usage: result.usage,
    },
  }
}

async function detectChapterAndQuestionsByDoubaoWithPrefixCache(params: {
  imageDataUrls: string[]
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  afterSwitchMode: boolean
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  extractEndBeforeQuestionKey?: string | null
  retryHint?: string
}): Promise<CombinedExtractWithPrefixCacheResult> {
  const {
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    afterSwitchMode,
    mode,
    processingStartQuestionKey = null,
    extractEndBeforeQuestionKey = null,
    retryHint = '',
  } = params

  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }
  if (mode === 'cross_page_merge' && (imageDataUrls.length < 2 || imageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(`cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images, got ${imageDataUrls.length}`)
  }

  const sharedInstruction = buildExtractSharedInstruction()
  const dynamicInstruction = buildExtractDynamicInstruction({
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    afterSwitchMode,
    mode,
    processingStartQuestionKey,
    extractEndBeforeQuestionKey,
    retryHint,
  })
  const fullInstruction = `${sharedInstruction}\n\n${dynamicInstruction}`

  const result = await requestArkResponsesPrefixCompletion({
    key: EXTRACT_PREFIX_CACHE_KEY,
    fixedResponseId: String(process.env.ARK_EXTRACT_PREFIX_RESPONSE_ID || '').trim(),
    sharedInput: [
      { role: 'system', content: '你只输出合法 JSON。' },
      { role: 'user', content: sharedInstruction },
    ],
    requestInput: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: dynamicInstruction }, ...buildImageContent(imageDataUrls)],
      },
    ],
    temperature: 0,
  })

  const output = await parseModelOutputWithFallback({
    text: result.text,
    imageDataUrls,
    originalInstruction: fullInstruction,
  })

  const dataNode =
    output.data && typeof output.data === 'object' ? (output.data as Record<string, unknown>) : null
  const chapterNode =
    output.chapter && typeof output.chapter === 'object'
      ? (output.chapter as Record<string, unknown>)
      : dataNode && dataNode.chapter && typeof dataNode.chapter === 'object'
        ? (dataNode.chapter as Record<string, unknown>)
        : output
  const questionNode =
    output.question && typeof output.question === 'object'
      ? (output.question as Record<string, unknown>)
      : dataNode && dataNode.question && typeof dataNode.question === 'object'
        ? (dataNode.question as Record<string, unknown>)
        : output

  const chapterTitleRaw =
    (typeof chapterNode.chapterTitle === 'string' && chapterNode.chapterTitle) ||
    (typeof output.chapterTitle === 'string' && output.chapterTitle) ||
    ''
  const sectionTitleRaw =
    (typeof chapterNode.sectionTitle === 'string' && chapterNode.sectionTitle) ||
    (typeof output.sectionTitle === 'string' && output.sectionTitle) ||
    ''
  const switchSectionTitleRaw =
    (typeof chapterNode.switchSectionTitle === 'string' && chapterNode.switchSectionTitle) ||
    (typeof output.switchSectionTitle === 'string' && output.switchSectionTitle) ||
    ''
  const questionsCandidateRaw: unknown =
    (Array.isArray(questionNode.questionsToUpsert) && questionNode.questionsToUpsert) ||
    (Array.isArray(questionNode.questions) && questionNode.questions) ||
    (Array.isArray((questionNode as Record<string, unknown>).questionList) &&
      (questionNode as Record<string, unknown>).questionList) ||
    (Array.isArray(output.questionsToUpsert) && output.questionsToUpsert) ||
    (Array.isArray(output.questions) && output.questions) ||
    (Array.isArray((output as Record<string, unknown>).questionList) &&
      (output as Record<string, unknown>).questionList) ||
    []
  const questionsCandidate = Array.isArray(questionsCandidateRaw) ? questionsCandidateRaw : []
  return {
    chapter: {
      chapterTitle:
        typeof chapterTitleRaw === 'string' && normalizeTitle(chapterTitleRaw)
          ? normalizeTitle(chapterTitleRaw)
          : null,
      sectionTitle:
        typeof sectionTitleRaw === 'string' && normalizeTitle(sectionTitleRaw)
          ? normalizeTitle(sectionTitleRaw)
          : null,
      switchSectionTitle:
        typeof switchSectionTitleRaw === 'string' && normalizeTitle(switchSectionTitleRaw)
          ? normalizeTitle(switchSectionTitleRaw)
          : null,
      needReprocessSameImage:
        chapterNode.needReprocessSameImage === true || output.needReprocessSameImage === true,
      reason: '',
    },
    question: {
      questionsToUpsert: questionsCandidate,
      needNextPage: false,
      continueQuestionKey: null,
      reason: '',
      rawText: result.text,
    },
    prefixCacheDebug: {
      seedResponseId: result.seedResponseId,
      requestResponseId: result.responseId,
      seedSource: result.seedSource,
      usage: result.usage,
    },
  }
}

async function detectLastQuestionContinuationWithLookaheadByDoubao(params: {
  queueImageDataUrls: string[]
  lookaheadImageDataUrl: string
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  lookaheadImageLabel?: string | null
}): Promise<LastQuestionLookaheadResult> {
  const {
    queueImageDataUrls,
    lookaheadImageDataUrl,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    lookaheadImageLabel = null,
  } = params

  const instruction = [
    '你是最后一题续页确认器。你只判断“当前队列最后一页中的最后一道顶层大题”是否继续到下一页预读图，不判断 hasExtractableQuestions，也不判断起点题是否完整。',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- 预读页: ${lookaheadImageLabel || 'next_page_preview'}`,
    '规则:',
    '1) 前N张图才是当前队列；最后1张图只是下一页预读图，不属于当前队列。',
    '2) 你必须先只根据前N张队列图片，识别“当前队列里按阅读顺序最后出现的那一道顶层大题”是谁；严禁把最后这张预读图里的题号算进当前队列。',
    '3) 这道“当前队列最后一题”不是当前章/小节的最后一题，也不是起点题，除非它确实就是前N张队列图片里最后出现的题。',
    '4) 如果当前队列最后一页发生了小节或章节切换，必须只按当前队列图片里的切换后内容识别最后一道顶层大题；不能把切换前旧小节的题误当成最后一题。',
    '5) 在确定了“当前队列最后一题”之后，才允许查看最后1张预读图，并且只判断这道题是否继续到了下一页。',
    '6) 如果预读图页首仍在继续这道“当前队列最后一题”，则 continueQuestionKey 返回该题完整定位“章标题 | 小节标题 | 第几题”。',
    '7) 如果预读图没有继续这道题，则 continueQuestionKey 返回 null。',
    '8) 预读图里出现的新题、后续题、其他更大的题号，统统不能当作当前队列最后一题，也不能直接当作 continueQuestionKey。',
    '9) 典型场景：若当前队列页上半还是习题8.1第8题，下半已切到习题8.2第1题，那么当前队列最后一道顶层大题是习题8.2第1题；如果预读页继续的是这道题，则 continueQuestionKey 必须返回习题8.2第1题，不能返回习题8.1第8题。',
    '10) 典型场景：若当前队列实际只到第3题，预读页里后面又出现第4题、第5题，也绝不能把第5题当成当前队列最后一题；你只能判断第3题是否在预读页继续。',
    '严格输出 JSON：',
    '{',
    '  "question": {',
    '    "continueQuestionKey": "string or null"',
    '  }',
    '}',
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
        content: [
          { type: 'input_text', text: instruction },
          ...queueImageDataUrls.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
          { type: 'input_image', image_url: lookaheadImageDataUrl },
        ],
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Lookahead output is not JSON: ${text.slice(0, 500)}`)
  }

  let output: Record<string, unknown>
  try {
    output = parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    output = await regenerateModelJsonWithImagesByDoubao({
      imageDataUrls: [...queueImageDataUrls, lookaheadImageDataUrl],
      originalInstruction: instruction,
      parseError,
      previousOutputText: text,
    })
  }

  const questionRaw =
    output.question && typeof output.question === 'object' ? (output.question as Record<string, unknown>) : {}

  return {
    continueQuestionKey:
      typeof questionRaw.continueQuestionKey === 'string' && questionRaw.continueQuestionKey.trim()
        ? questionRaw.continueQuestionKey.trim()
        : null,
    reason: '',
    rawText: text,
  }
}

export async function processChapterSessionImageWithResponsesPrefixCache(params: {
  sessionId: string
  imageDataUrl: string
  imageLabel?: string
  lookaheadImageDataUrl?: string
  lookaheadImageLabel?: string
  overrideChapterTitle?: string
  overrideSectionTitle?: string
}) {
  const {
    sessionId,
    imageDataUrl,
    imageLabel = '',
    lookaheadImageDataUrl = '',
    lookaheadImageLabel = '',
    overrideChapterTitle = '',
    overrideSectionTitle = '',
  } = params
  const session = chapterSessions.get(sessionId)
  if (!session) {
    throw new Error('session not found, please init first')
  }

  if (overrideChapterTitle.trim()) {
    session.currentChapterTitle = normalizeTitle(overrideChapterTitle)
  }
  if (overrideSectionTitle.trim()) {
    session.currentSectionTitle = normalizeTitle(overrideSectionTitle)
  }

  const payload = await loadTextbookJson(session.jsonFilePath)

  let activeChapterTitle = normalizeTitle(session.currentChapterTitle)
  let activeSectionTitle = normalizeTitle(session.currentSectionTitle)
  const pageEntryChapterTitle = activeChapterTitle
  const pageEntrySectionTitle = activeSectionTitle
  const passLogs: Array<Record<string, unknown>> = []

  const initialTopChapter = ensureTopChapter(payload, activeChapterTitle)
  const initialSection = ensureSectionChapter(payload, initialTopChapter.chapterId, activeSectionTitle)
  let activeSectionChapterId = initialSection.chapterId
  const questionSession = questionSessions.get(sessionId) || {
    sessionId,
    jsonFilePath: session.jsonFilePath,
    currentChapterTitle: activeChapterTitle,
    currentSectionTitle: activeSectionTitle,
    currentSectionChapterId: initialSection.chapterId,
    pendingPageDataUrls: [],
    pendingPageLabels: [],
    pendingContinueQuestionKey: null,
    processingStartQuestionKey: null,
    pendingReason: null,
    pendingUpsertedCount: 0,
    updatedAt: new Date().toISOString(),
  }

  let pendingPageDataUrls = Array.isArray(questionSession.pendingPageDataUrls)
    ? questionSession.pendingPageDataUrls.filter((item) => typeof item === 'string' && item.trim())
    : []
  let pendingPageLabels = Array.isArray(questionSession.pendingPageLabels)
    ? questionSession.pendingPageLabels.filter((item) => typeof item === 'string' && item.trim())
    : []
  if (pendingPageDataUrls.length > MAX_PENDING_QUEUE_PAGES - 1) {
    pendingPageDataUrls = pendingPageDataUrls.slice(-(MAX_PENDING_QUEUE_PAGES - 1))
    pendingPageLabels = pendingPageLabels.slice(-(MAX_PENDING_QUEUE_PAGES - 1))
  }
  const sessionStoredProcessingStartQuestionKey = questionSession.processingStartQuestionKey
  const sessionStoredPendingContinueQuestionKey = questionSession.pendingContinueQuestionKey
  let pendingContinueQuestionKey = questionSession.pendingContinueQuestionKey
  const processingStartQuestionKey =
    questionSession.processingStartQuestionKey || questionSession.pendingContinueQuestionKey
  const mode: 'single_page' | 'cross_page_merge' = pendingPageDataUrls.length ? 'cross_page_merge' : 'single_page'
  const questionImageDataUrls = pendingPageDataUrls.length
    ? [...pendingPageDataUrls, imageDataUrl]
    : [imageDataUrl]
  const questionImageLabels = pendingPageLabels.length
    ? [...pendingPageLabels, imageLabel || 'current']
    : [imageLabel || 'current']
  if (mode === 'cross_page_merge' && (questionImageDataUrls.length < 2 || questionImageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(`cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images`)
  }
  const crossPageContext =
    mode === 'cross_page_merge'
      ? buildCrossPageContext({
          processingStartQuestionKey,
          pendingContinueQuestionKey,
          pendingReason: questionSession.pendingReason,
          pendingUpsertedCount: questionSession.pendingUpsertedCount,
          pendingPagesCount: pendingPageDataUrls.length,
          pendingPageLabels,
        })
      : ''

  const boundaryDetect = await detectChapterBoundaryAndPendingByDoubaoWithPrefixCache({
    imageDataUrls: questionImageDataUrls,
    currentChapterTitle: activeChapterTitle,
    currentSectionTitle: activeSectionTitle,
    currentSectionChapterId: activeSectionChapterId,
    mode,
    processingStartQuestionKey,
    pendingContinueQuestionKey,
    crossPageContext,
  })

  let chapterDetect: ChapterDetectResult = {
    chapterTitle: null,
    sectionTitle: null,
    switchSectionTitle: null,
    needReprocessSameImage: false,
    reason: '',
  }
  let finalQuestionDetect: QuestionExtractResult = {
    questionsToUpsert: [],
    needNextPage: boundaryDetect.question.needNextPage,
    continueQuestionKey: boundaryDetect.question.continueQuestionKey,
    reason: boundaryDetect.question.reason,
    rawText: boundaryDetect.question.rawText,
  }
  let retried = false

  let chapterTitle = activeChapterTitle
  let sectionTitle = activeSectionTitle
  let switched = false
  let chapter = ensureTopChapter(payload, chapterTitle)
  let section = ensureSectionChapter(payload, chapter.chapterId, sectionTitle)

  const boundaryPrefixCacheDebug = boundaryDetect.prefixCacheDebug
  const extractPrefixCacheRuns: PrefixCacheDebugInfo[] = []
  const boundaryContinueKey = resolveContinueQuestionKey(boundaryDetect.question.continueQuestionKey)
  let effectiveBoundaryContinueKey: string | null = boundaryContinueKey || null
  let boundaryLookaheadReason = ''
  if (lookaheadImageDataUrl) {
    try {
      const lookaheadDetect = await detectLastQuestionContinuationWithLookaheadByDoubao({
        queueImageDataUrls: questionImageDataUrls,
        lookaheadImageDataUrl,
        currentChapterTitle: activeChapterTitle,
        currentSectionTitle: activeSectionTitle,
        currentSectionChapterId: activeSectionChapterId,
        lookaheadImageLabel: lookaheadImageLabel || null,
      })
      boundaryLookaheadReason = lookaheadDetect.reason || ''
      effectiveBoundaryContinueKey = resolveContinueQuestionKey(lookaheadDetect.continueQuestionKey) || null
    } catch (error) {
      boundaryLookaheadReason = error instanceof Error ? `预读判断失败: ${error.message}` : `预读判断失败: ${String(error)}`
    }
  }
  let pendingFiltered = { filtered: [] as QuestionItem[], droppedCount: 0 }
  let normalizedQuestions: QuestionItem[] = []
  let pendingReviewLogs: Array<Record<string, string>> = []
  let pendingReviewFixRetried = false
  let integrityFixRetried = false
  let extractReason = ''
  let retryExtractReason = ''
  let integrityRetryReason = ''
  let rangeRetryReason = ''
  let extractReturnedCount = 0
  let normalizedCount = 0
  let rangeFixRetried = false
  let rangeMismatchBlocked = false

  if (boundaryDetect.question.hasExtractableQuestions) {
    let questionsRaw: unknown[] = []
    const extractDetect = await detectChapterAndQuestionsByDoubaoWithPrefixCache({
      imageDataUrls: questionImageDataUrls,
      currentChapterTitle: chapterTitle,
      currentSectionTitle: sectionTitle,
      currentSectionChapterId: section.chapterId,
      afterSwitchMode: false,
      mode,
      processingStartQuestionKey,
      extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
    })
    extractPrefixCacheRuns.push(extractDetect.prefixCacheDebug)
    finalQuestionDetect = {
      ...extractDetect.question,
      needNextPage: Boolean(effectiveBoundaryContinueKey),
      continueQuestionKey: effectiveBoundaryContinueKey || null,
      reason: boundaryDetect.question.reason || extractDetect.question.reason,
    }
    extractReason = extractDetect.question.reason || ''
    chapterDetect = extractDetect.chapter
    questionsRaw = finalQuestionDetect.questionsToUpsert
    extractReturnedCount = Array.isArray(questionsRaw) ? questionsRaw.length : 0

    if (!questionsRaw.length) {
      const retryDetect = await detectChapterAndQuestionsByDoubaoWithPrefixCache({
        imageDataUrls: questionImageDataUrls,
        currentChapterTitle: chapterTitle,
        currentSectionTitle: sectionTitle,
        currentSectionChapterId: section.chapterId,
        afterSwitchMode: false,
        mode,
        processingStartQuestionKey,
        extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
        retryHint:
          '边界判断已确认当前队列存在可完整入库的题目。请严格按起点开始提取，只输出可入库范围内的完整题，禁止输出跨页题。',
      })
      extractPrefixCacheRuns.push(retryDetect.prefixCacheDebug)
      finalQuestionDetect = {
        ...retryDetect.question,
        needNextPage: Boolean(effectiveBoundaryContinueKey),
        continueQuestionKey: effectiveBoundaryContinueKey || null,
        reason: boundaryDetect.question.reason || retryDetect.question.reason,
      }
      retryExtractReason = retryDetect.question.reason || ''
      chapterDetect = retryDetect.chapter
      questionsRaw = finalQuestionDetect.questionsToUpsert
      extractReturnedCount = Array.isArray(questionsRaw) ? questionsRaw.length : 0
      retried = true
    }

    if (!questionsRaw.length) {
      throw new Error('Boundary detected extractable questions, but extractor returned no questions')
    }

    const normalizedQuestionsAll = questionsRaw
      .map((item) => normalizeQuestionItem(item, section.chapterId, sectionTitle))
      .filter(Boolean) as QuestionItem[]
    pendingFiltered = {
      filtered: normalizedQuestionsAll,
      droppedCount: 0,
    }
    normalizedQuestions = pendingFiltered.filtered
    normalizedCount = normalizedQuestions.length
    let rangeMismatch = detectExtractorRangeMismatch({
      boundaryReason: boundaryDetect.question.reason,
      processingStartQuestionKey,
      extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
      extractReason,
      normalizedQuestions,
    })

    if (rangeMismatch.shouldRetry) {
      rangeFixRetried = true
      try {
        const rangeRetryDetect = await detectChapterAndQuestionsByDoubaoWithPrefixCache({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          retryHint: `${rangeMismatch.reason} 结构化范围约束：endBeforeQuestionKey=${effectiveBoundaryContinueKey || 'null'}。如果 endBeforeQuestionKey 为 null，严禁把 startQuestionKey 当作截止题号，必须继续提取起点之后所有完整顶层大题。`,
        })
        extractPrefixCacheRuns.push(rangeRetryDetect.prefixCacheDebug)
        rangeRetryReason = rangeRetryDetect.question.reason || ''
        const rangeRetryRaw = rangeRetryDetect.question.questionsToUpsert
        const rangeRetryNormalized = rangeRetryRaw
          .map((item) => normalizeQuestionItem(item, section.chapterId, sectionTitle))
          .filter(Boolean) as QuestionItem[]
        const rangeRetryMismatch = detectExtractorRangeMismatch({
          boundaryReason: boundaryDetect.question.reason,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          extractReason: rangeRetryDetect.question.reason || '',
          normalizedQuestions: rangeRetryNormalized,
        })
        if (rangeRetryNormalized.length && !rangeRetryMismatch.shouldRetry) {
          normalizedQuestions = rangeRetryNormalized
          normalizedCount = normalizedQuestions.length
          finalQuestionDetect.rawText = rangeRetryDetect.question.rawText
          pendingFiltered = {
            filtered: normalizedQuestions,
            droppedCount: 0,
          }
          rangeMismatch = { shouldRetry: false, reason: '' }
        } else {
          rangeMismatch = rangeRetryMismatch
        }
      } catch (error) {
        rangeRetryReason = error instanceof Error ? error.message : String(error)
      }
    }

    if (rangeMismatch.shouldRetry) {
      rangeMismatchBlocked = true
      normalizedQuestions = []
      normalizedCount = 0
      pendingFiltered = {
        filtered: [],
        droppedCount: 0,
      }
      effectiveBoundaryContinueKey =
        boundaryContinueKey || processingStartQuestionKey || pendingContinueQuestionKey || null
      finalQuestionDetect = {
        ...finalQuestionDetect,
        questionsToUpsert: [],
        needNextPage: true,
        continueQuestionKey: effectiveBoundaryContinueKey,
        reason: `${rangeMismatch.reason} 为避免错误入库，保留当前队列并等待下一页再次判断。`,
      }
    }

    pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)

    if (!rangeMismatchBlocked && pendingReviewLogs.length > 0) {
      pendingReviewFixRetried = true
      try {
        const fixDetect = await detectChapterAndQuestionsByDoubaoWithPrefixCache({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          retryHint: `上一轮提取结果含有 ${pendingReviewLogs.length} 处【待校对】。请重新看图并仅修复这些位置，严格保持提取范围不变。`,
        })
        extractPrefixCacheRuns.push(fixDetect.prefixCacheDebug)
        const fixRaw = fixDetect.question.questionsToUpsert
        const fixAll = fixRaw
          .map((item) => normalizeQuestionItem(item, section.chapterId, sectionTitle))
          .filter(Boolean) as QuestionItem[]
        const fixPendingLogs = collectPendingReviewLogs(fixAll)
        if (fixAll.length && fixPendingLogs.length <= pendingReviewLogs.length) {
          normalizedQuestions = fixAll
          normalizedCount = normalizedQuestions.length
          pendingReviewLogs = fixPendingLogs
          finalQuestionDetect.rawText = fixDetect.question.rawText
          pendingFiltered = {
            filtered: fixAll,
            droppedCount: 0,
          }
        }
      } catch {
        // Ignore fix attempt failure and keep first extraction result.
      }
    }

    let integrityIssue = rangeMismatchBlocked ? null : detectQuestionIntegrityIssue(normalizedQuestions)
    if (!rangeMismatchBlocked && integrityIssue) {
      integrityFixRetried = true
      try {
        const integrityRetryDetect = await detectChapterAndQuestionsByDoubaoWithPrefixCache({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          retryHint: `上一轮提取结果不完整：${integrityIssue.reason}。请重新看图，完整输出这道题所有可见小问和答案；若仍未完整结束则不要输出这道题。`,
        })
        extractPrefixCacheRuns.push(integrityRetryDetect.prefixCacheDebug)
        const integrityRetryRaw = integrityRetryDetect.question.questionsToUpsert
        const integrityRetryNormalized = integrityRetryRaw
          .map((item) => normalizeQuestionItem(item, section.chapterId, sectionTitle))
          .filter(Boolean) as QuestionItem[]
        const retriedIssue = detectQuestionIntegrityIssue(integrityRetryNormalized)
        integrityRetryReason = integrityRetryDetect.question.reason || ''
        if (integrityRetryNormalized.length && !retriedIssue) {
          normalizedQuestions = integrityRetryNormalized
          normalizedCount = normalizedQuestions.length
          pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)
          finalQuestionDetect.rawText = integrityRetryDetect.question.rawText
          pendingFiltered = {
            filtered: normalizedQuestions,
            droppedCount: 0,
          }
          integrityIssue = null
        }
      } catch {
        // Ignore integrity retry failure and keep current extraction result.
      }
    }

    const unresolvedIntegrityIssue = rangeMismatchBlocked ? null : detectQuestionIntegrityIssue(normalizedQuestions)
    if (unresolvedIntegrityIssue) {
      pendingFiltered = {
        filtered: normalizedQuestions.slice(0, unresolvedIntegrityIssue.index),
        droppedCount: Math.max(0, normalizedQuestions.length - unresolvedIntegrityIssue.index),
      }
      normalizedQuestions = pendingFiltered.filtered
      effectiveBoundaryContinueKey = unresolvedIntegrityIssue.continueKey
      finalQuestionDetect = {
        ...finalQuestionDetect,
        needNextPage: true,
        continueQuestionKey: unresolvedIntegrityIssue.continueKey,
        reason: unresolvedIntegrityIssue.reason,
      }
      pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)
    }

    if (!rangeMismatchBlocked && shouldClearTrailingPendingAfterExtraction(normalizedQuestions, effectiveBoundaryContinueKey)) {
      effectiveBoundaryContinueKey = null
      finalQuestionDetect = {
        ...finalQuestionDetect,
        needNextPage: false,
        continueQuestionKey: null,
      }
    }
  } else {
    finalQuestionDetect = {
      questionsToUpsert: [],
      needNextPage: true,
      continueQuestionKey: effectiveBoundaryContinueKey || null,
      reason: boundaryDetect.question.reason,
      rawText: boundaryDetect.question.rawText,
    }
  }

  chapterTitle = chapterDetect.chapterTitle || activeChapterTitle
  const switchSectionTitle = chapterDetect.switchSectionTitle
  sectionTitle =
    switchSectionTitle && normalizeTitle(chapterTitle) === normalizeTitle(pageEntryChapterTitle)
      ? pageEntrySectionTitle
      : chapterDetect.sectionTitle || activeSectionTitle
  chapter = ensureTopChapter(payload, chapterTitle)
  section = ensureSectionChapter(payload, chapter.chapterId, sectionTitle)
  activeChapterTitle = chapterTitle
  activeSectionTitle = sectionTitle
  activeSectionChapterId = section.chapterId

  switched = false
  if (switchSectionTitle && normalizeTitle(switchSectionTitle) !== normalizeTitle(activeSectionTitle)) {
    const switchedSection = ensureSectionChapter(payload, chapter.chapterId, switchSectionTitle)
    activeSectionTitle = normalizeTitle(switchSectionTitle)
    activeSectionChapterId = switchedSection.chapterId
    switched = true
  }

  normalizedQuestions = rewriteQuestionTitlesByResolvedChapter(payload, normalizedQuestions)

  const effectiveHasExtractableQuestions =
    boundaryDetect.question.hasExtractableQuestions && !rangeMismatchBlocked

  if (effectiveHasExtractableQuestions) {
    upsertQuestionsById(payload, normalizedQuestions)
    await appendPendingReviewLogs(sessionId, pendingReviewLogs)
  }

  if (!effectiveHasExtractableQuestions) {
    pendingPageDataUrls = [...questionImageDataUrls]
    pendingPageLabels = [...questionImageLabels]
    if (pendingPageDataUrls.length > MAX_PENDING_QUEUE_PAGES) {
      pendingPageDataUrls = pendingPageDataUrls.slice(-MAX_PENDING_QUEUE_PAGES)
      pendingPageLabels = pendingPageLabels.slice(-MAX_PENDING_QUEUE_PAGES)
    }
    pendingContinueQuestionKey = effectiveBoundaryContinueKey || null
    questionSession.processingStartQuestionKey = processingStartQuestionKey
    questionSession.pendingReason = boundaryDetect.question.reason
    questionSession.pendingUpsertedCount = 0
  } else if (effectiveBoundaryContinueKey) {
    pendingPageDataUrls = [imageDataUrl]
    pendingPageLabels = [imageLabel || 'current']
    pendingContinueQuestionKey = effectiveBoundaryContinueKey
    questionSession.processingStartQuestionKey = effectiveBoundaryContinueKey
    questionSession.pendingReason = boundaryDetect.question.reason
    questionSession.pendingUpsertedCount = normalizedQuestions.length
  } else {
    pendingPageDataUrls = []
    pendingPageLabels = []
    pendingContinueQuestionKey = null
    questionSession.processingStartQuestionKey = null
    questionSession.pendingReason = null
    questionSession.pendingUpsertedCount = 0
  }

  passLogs.push({
    pass: 1,
    chapterTitle: activeChapterTitle,
    sectionTitle,
    switchSectionTitle: switchSectionTitle ?? null,
    switched,
    needReprocessSameImage: false,
    reason: chapterDetect.reason,
    prefixCacheExperiment: {
      boundary: boundaryPrefixCacheDebug,
      extracts: extractPrefixCacheRuns,
    },
    question: {
      mode,
      pending: finalQuestionDetect.needNextPage,
      reason: finalQuestionDetect.reason,
      processingStartQuestionKey,
      nextStartQuestionKey: finalQuestionDetect.needNextPage
        ? pendingContinueQuestionKey || processingStartQuestionKey || null
        : null,
      continueQuestionKey: finalQuestionDetect.continueQuestionKey,
      upsertedCount: normalizedQuestions.length,
      pendingReviewCount: pendingReviewLogs.length,
      droppedPendingQuestionCount: pendingFiltered.droppedCount,
      pendingPageLabels,
      boundaryHasExtractableQuestions: boundaryDetect.question.hasExtractableQuestions,
      boundaryNeedNextPage: boundaryDetect.question.needNextPage,
      boundaryContinueQuestionKey: effectiveBoundaryContinueKey,
      boundaryLookaheadLabel: lookaheadImageLabel || null,
      boundaryLookaheadReason,
      pendingReviewFixRetried,
      integrityFixRetried,
      rangeFixRetried,
      rangeMismatchBlocked,
      boundaryReason: boundaryDetect.question.reason,
      extractReason,
      retryExtractReason,
      integrityRetryReason,
      rangeRetryReason,
      extractReturnedCount,
      normalizedCount,
      sessionStoredProcessingStartQuestionKey,
      sessionStoredPendingContinueQuestionKey,
      effectiveProcessingStartQuestionKey: processingStartQuestionKey,
      effectiveExtractEndBeforeQuestionKey: effectiveBoundaryContinueKey,
      effectiveExtractMode: mode,
      retried,
    },
  })

  const activeTopChapter = ensureTopChapter(payload, activeChapterTitle)
  const activeSection = ensureSectionChapter(payload, activeTopChapter.chapterId, activeSectionTitle)
  questionSession.currentChapterTitle = activeChapterTitle
  questionSession.currentSectionTitle = activeSectionTitle
  questionSession.currentSectionChapterId = activeSection.chapterId
  questionSession.pendingPageDataUrls = pendingPageDataUrls
  questionSession.pendingPageLabels = pendingPageLabels
  questionSession.pendingContinueQuestionKey = pendingContinueQuestionKey

  const questionResult: Record<string, unknown> = finalQuestionDetect.needNextPage
    ? {
        pending: true,
        reason: finalQuestionDetect.reason,
        processingStartQuestionKey,
        nextStartQuestionKey: pendingContinueQuestionKey || processingStartQuestionKey || null,
        continueQuestionKey: pendingContinueQuestionKey,
        pendingPagesCount: pendingPageDataUrls.length,
        pendingPageLabels,
        upsertedCount: normalizedQuestions.length,
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: pendingFiltered.droppedCount,
        boundaryHasExtractableQuestions: boundaryDetect.question.hasExtractableQuestions,
        boundaryNeedNextPage: boundaryDetect.question.needNextPage,
        boundaryContinueQuestionKey: effectiveBoundaryContinueKey,
        boundaryLookaheadLabel: lookaheadImageLabel || null,
        boundaryLookaheadReason,
        boundaryReason: boundaryDetect.question.reason,
        extractReason,
        retryExtractReason,
        integrityRetryReason,
        rangeRetryReason,
        extractReturnedCount,
        normalizedCount,
        sessionStoredProcessingStartQuestionKey,
        sessionStoredPendingContinueQuestionKey,
        effectiveProcessingStartQuestionKey: processingStartQuestionKey,
        effectiveExtractEndBeforeQuestionKey: effectiveBoundaryContinueKey,
        effectiveExtractMode: mode,
        integrityFixRetried,
        pendingReviewFixRetried,
        rangeFixRetried,
        rangeMismatchBlocked,
        rawText: finalQuestionDetect.rawText,
        retried,
      }
    : {
        pending: false,
        reason: finalQuestionDetect.reason,
        processingStartQuestionKey,
        nextStartQuestionKey: null,
        pendingPagesCount: 0,
        pendingPageLabels: [],
        upsertedCount: normalizedQuestions.length,
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: pendingFiltered.droppedCount,
        boundaryHasExtractableQuestions: boundaryDetect.question.hasExtractableQuestions,
        boundaryNeedNextPage: boundaryDetect.question.needNextPage,
        boundaryContinueQuestionKey: effectiveBoundaryContinueKey,
        boundaryLookaheadLabel: lookaheadImageLabel || null,
        boundaryLookaheadReason,
        boundaryReason: boundaryDetect.question.reason,
        extractReason,
        retryExtractReason,
        integrityRetryReason,
        rangeRetryReason,
        extractReturnedCount,
        normalizedCount,
        sessionStoredProcessingStartQuestionKey,
        sessionStoredPendingContinueQuestionKey,
        effectiveProcessingStartQuestionKey: processingStartQuestionKey,
        effectiveExtractEndBeforeQuestionKey: effectiveBoundaryContinueKey,
        effectiveExtractMode: mode,
        integrityFixRetried,
        pendingReviewFixRetried,
        rangeFixRetried,
        rangeMismatchBlocked,
        rawText: finalQuestionDetect.rawText,
        retried,
      }

  await saveTextbookJson(session.jsonFilePath, payload)
  session.currentChapterTitle = activeChapterTitle
  session.currentSectionTitle = activeSectionTitle
  session.updatedAt = new Date().toISOString()
  chapterSessions.set(sessionId, session)
  questionSession.updatedAt = new Date().toISOString()
  questionSessions.set(sessionId, questionSession)

  return {
    message: 'success',
    sessionId,
    jsonFilePath: session.jsonFilePath,
    currentChapterTitle: session.currentChapterTitle,
    currentSectionTitle: session.currentSectionTitle,
    currentSectionChapterId: activeSection.chapterId,
    chaptersCount: payload.chapters.length,
    questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
    passLogs,
    question: questionResult,
    prefixCacheExperiment: {
      boundary: boundaryPrefixCacheDebug,
      extracts: extractPrefixCacheRuns,
    },
  }
}
