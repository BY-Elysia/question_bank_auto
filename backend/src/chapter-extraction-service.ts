import path from 'node:path'
import {
  ARK_MODEL,
  MERGED_JSON_DIR,
  MAX_PENDING_QUEUE_PAGES,
  OUTPUT_DIR,
  OUTPUT_JSON_DIR,
  READ_RESULTS_DIR,
  UPLOAD_DIR,
} from './config'
import {
  extractArkText,
  getEffectiveArkApiKey,
  requestArkRawWithRetry,
} from './infrastructure/ark/ark-client'
import {
  getPayloadAnswerHandlingMode,
  getPayloadDocumentType,
  getPayloadSourceMeta,
  payloadExpectsAnswer,
  resolveAnswerHandlingMode,
} from './domains/question-json/payload'
import {
  ensureSectionChapter,
  ensureTopChapter,
  normalizeTitle,
} from './domains/question-json/chapter-tree'
import {
  QUESTION_TYPE_OPTIONS,
  normalizeQuestionType,
} from './domains/question-json/question-types'
import {
  extractFirstJsonObject,
  parseModelJsonObject,
} from './domains/question-json/model-json'
import {
  regenerateModelJsonWithImagesByDoubao,
  repairModelJsonByDoubao,
} from './domains/question-json/model-json-repair'
import {
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
} from './domains/question-json/extraction-instructions'
import {
  buildCanonicalQuestionTitle,
  buildQuestionDisplayTitle,
  detectQuestionEmptyAnswerIssue,
  detectQuestionIntegrityIssue,
  extractQuestionNoFromId,
  extractQuestionNoFromPrompt,
  extractQuestionNoFromText,
  isLikelyIncompleteForQueue,
  normalizeDigits,
  normalizeQuestionItem,
  rewriteQuestionTitlesByResolvedChapter,
} from './domains/question-json/question-normalize'
import { upsertQuestionsById } from './domains/question-json/question-upsert'
import { loadTextbookJson, saveTextbookJson } from './domains/question-json/textbook-store'
import { appendPendingReviewLogs, collectPendingReviewLogs } from './domains/question-json/review-logs'
import {
  batchId,
  ensureDir,
  isSupportedImageFileName,
  normalizeJsonFileName,
  parsePageIndex,
  sanitizeFileName,
  sanitizeFolderName,
  sortImageFileNames,
} from './shared/file-utils'
import {
  getChapterSession,
  getQuestionSession,
  setChapterSession,
  setQuestionSession,
} from './state'
import type {
  AnswerHandlingMode,
  ChapterDetectResult,
  ChapterItem,
  ChapterSessionState,
  CombinedExtractResult,
  LastQuestionLookaheadResult,
  QuestionBoundaryResult,
  QuestionExtractResult,
  QuestionGroup,
  QuestionGroupChild,
  QuestionItem,
  QuestionLeaf,
  QuestionOption,
  QuestionRubricItem,
  QuestionSessionState,
  QuestionTextBlock,
  RangeMismatchCheckResult,
  TextbookJsonPayload,
} from './types'

function normalizeJsonPath(filePath: string) {
  return path.resolve(String(filePath || '').trim())
}



function resolveContinueQuestionKey(continueQuestionKey: string | null) {
  const direct = String(continueQuestionKey || '').trim()
  if (direct) return direct
  return ''
}

function readQuestionKeyField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function normalizeQuestionKeyForCompare(value: string | null) {
  return normalizeDigits(String(value || ''))
    .split('|')
    .map((part) => normalizeTitle(part))
    .filter(Boolean)
    .join('|')
}

function extractSectionTitleFromContinueQuestionKey(value: string | null) {
  const parts = String(value || '')
    .split('|')
    .map((part) => normalizeTitle(part))
    .filter(Boolean)
  return parts.length >= 3 ? parts[1] : ''
}

function shouldAcceptLookaheadContinueQuestionKey(params: {
  lookaheadTailQuestionKey: string | null
  boundaryQueueTailQuestionKey: string | null
  lookaheadContinueKey: string | null
  boundaryContinueKey: string | null
  boundaryReason: string
  currentSectionTitle: string
}) {
  const boundaryQueueTailQuestionKey = resolveContinueQuestionKey(params.boundaryQueueTailQuestionKey)
  const lookaheadTailQuestionKey = resolveContinueQuestionKey(params.lookaheadTailQuestionKey)
  if (boundaryQueueTailQuestionKey && !lookaheadTailQuestionKey) {
    return {
      accepted: false,
      reason: `预读助手没有返回正式队列尾题；忽略预读结果，避免预读页污染当前队列。`,
    }
  }

  if (
    boundaryQueueTailQuestionKey
    && lookaheadTailQuestionKey
    && normalizeQuestionKeyForCompare(boundaryQueueTailQuestionKey) !== normalizeQuestionKeyForCompare(lookaheadTailQuestionKey)
  ) {
    return {
      accepted: false,
      reason:
        `预读助手复核出的正式队列尾题为“${lookaheadTailQuestionKey}”，但边界助手尾题为“${boundaryQueueTailQuestionKey}”；需要重判，预读页不能参与确定正式队列尾题。`,
    }
  }

  const lookaheadContinueKey = resolveContinueQuestionKey(params.lookaheadContinueKey)
  if (!lookaheadContinueKey) {
    return { accepted: true, reason: '' }
  }

  if (
    boundaryQueueTailQuestionKey
    && normalizeQuestionKeyForCompare(lookaheadContinueKey) !== normalizeQuestionKeyForCompare(boundaryQueueTailQuestionKey)
  ) {
    return {
      accepted: false,
      reason:
        `预读续题指向“${lookaheadContinueKey}”，但它不是边界助手确认的正式队列尾题“${boundaryQueueTailQuestionKey}”；忽略预读结果。`,
    }
  }

  const lookaheadQuestionNo = Number(extractQuestionNoFromText(lookaheadContinueKey) || 0)
  const boundaryQuestionNos = extractDistinctQuestionNos(params.boundaryReason)
  const maxBoundaryQuestionNo = boundaryQuestionNos.length ? Math.max(...boundaryQuestionNos) : 0
  const boundaryContinueQuestionNo = Number(extractQuestionNoFromText(params.boundaryContinueKey || '') || 0)
  if (
    lookaheadQuestionNo > 0
    && maxBoundaryQuestionNo > 0
    && lookaheadQuestionNo > maxBoundaryQuestionNo
    && lookaheadQuestionNo !== boundaryContinueQuestionNo
  ) {
    return {
      accepted: false,
      reason:
        `预读续题指向第${lookaheadQuestionNo}题，但当前队列边界只确认到第${maxBoundaryQuestionNo}题；忽略预读结果，避免把预读页中的后续题当成当前队列最后题。`,
    }
  }

  const lookaheadSectionTitle = extractSectionTitleFromContinueQuestionKey(lookaheadContinueKey)
  if (!lookaheadSectionTitle) {
    return { accepted: true, reason: '' }
  }

  const currentSectionTitle = normalizeTitle(params.currentSectionTitle)
  if (normalizeTitle(lookaheadSectionTitle) === currentSectionTitle) {
    return { accepted: true, reason: '' }
  }

  const boundarySectionTitle = extractSectionTitleFromContinueQuestionKey(params.boundaryContinueKey)
  if (boundarySectionTitle && normalizeTitle(boundarySectionTitle) === normalizeTitle(lookaheadSectionTitle)) {
    return { accepted: true, reason: '' }
  }

  return {
    accepted: false,
    reason:
      `预读续题指向小节“${lookaheadSectionTitle}”，但当前队列边界判断未确认该小节；忽略预读结果，避免下一页小节提前污染当前页。`,
  }
}

function extractDistinctQuestionNos(value: string) {
  const normalized = normalizeDigits(String(value || ''))
  const nums: number[] = []
  for (const match of normalized.matchAll(/第\s*([\d\s、,，和及至到\-~～]+)\s*题/g)) {
    const raw = match[1] || ''
    for (const numMatch of raw.matchAll(/\d+/g)) {
      const num = Number(numMatch[0])
      if (Number.isFinite(num) && num > 0) {
        nums.push(num)
      }
    }
  }
  return [...new Set(nums)]
}

function topQuestionNosFromItems(items: QuestionItem[]) {
  return [...new Set(
    items
      .map((item) => Number(extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title) || 0))
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
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }

  const startNo = Number(extractQuestionNoFromText(processingStartQuestionKey || '') || 0)
  if (!startNo) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }

  const boundaryNos = extractDistinctQuestionNos(boundaryReason).filter((num) => num >= startNo)
  const returnedNos = topQuestionNosFromItems(normalizedQuestions)
  if (!boundaryNos.length || !returnedNos.length) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
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
    !extractEndBeforeQuestionKey &&
    onlyReturnedStart &&
    /截止题号.*第\s*\d+\s*题/.test(extractReasonNormalized)
  ) {
    return {
      shouldRetry: true,
      reason: `第二助手在 endBeforeQuestionKey=null 的情况下，仍把截止题号解释成了起点题第${startNo}题。`,
    }
  }

  return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
}

function detectBoundaryReasonScopeMismatch(params: {
  boundaryReason: string
  processingStartQuestionKey: string | null
}) {
  const { boundaryReason, processingStartQuestionKey } = params
  const startNo = Number(extractQuestionNoFromText(processingStartQuestionKey || '') || 0)
  if (!startNo) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }
  const boundaryNos = extractDistinctQuestionNos(boundaryReason)
  const earlierNos = boundaryNos.filter((num) => num > 0 && num < startNo)
  if (!earlierNos.length) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }
  return {
    shouldRetry: true,
    reason: `当前处理起点已是第${startNo}题，但边界理由仍提到了起点之前的题号（${earlierNos.join(', ')}），说明边界判断没有严格按起点范围作答。`,
  } as RangeMismatchCheckResult
}

function excludePendingQuestionItems(items: QuestionItem[], continueKey: string) {
  if (!continueKey) {
    return { filtered: items, droppedCount: 0 }
  }
  const normalizedKey = normalizeDigits(continueKey).replace(/\s+/g, '')
  const continueNo = Number(extractQuestionNoFromText(continueKey) || 0)
  const matchedIndex = items.findIndex((item) => matchesContinueKey(item, continueKey))
  if (matchedIndex !== -1) {
    return {
      filtered: items.slice(0, matchedIndex),
      droppedCount: Math.max(0, items.length - matchedIndex),
    }
  }
  const filtered = items.filter((item) => {
    const itemNo = Number(extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title) || 0)
    if (continueNo && itemNo && itemNo >= continueNo) {
      return false
    }
    const compactTitle = normalizeDigits(item.title || '').replace(/\s+/g, '')
    if (compactTitle && normalizedKey && compactTitle.includes(normalizedKey)) {
      return false
    }
    return true
  })
  return {
    filtered,
    droppedCount: Math.max(0, items.length - filtered.length),
  }
}

function filterQuestionItemsByRange(params: {
  items: QuestionItem[]
  startQuestionKey?: string | null
  endQuestionKeyExclusive?: string | null
}) {
  const { items, startQuestionKey = null, endQuestionKeyExclusive = null } = params
  const startNo = Number(extractQuestionNoFromText(startQuestionKey || '') || 0)
  const endNo = Number(extractQuestionNoFromText(endQuestionKeyExclusive || '') || 0)
  if (!startNo && !endNo) {
    return { filtered: items, droppedCount: 0 }
  }
  const filtered = items.filter((item) => {
    const itemNo = Number(extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title) || 0)
    if (!itemNo) return false
    if (startNo && itemNo < startNo) return false
    if (endNo && itemNo >= endNo) return false
    return true
  })
  return {
    filtered,
    droppedCount: Math.max(0, items.length - filtered.length),
  }
}


function trimLikelyIncompleteTail(items: QuestionItem[], options?: { expectAnswer?: boolean }) {
  const expectAnswer = options?.expectAnswer !== false
  const cutIndex = items.findIndex((item) => isLikelyIncompleteForQueue(item, expectAnswer))
  if (cutIndex === -1) {
    return null
  }
  const pendingItem = items[cutIndex]
  const continueKey =
    pendingItem.title ||
    (pendingItem.nodeType === 'GROUP'
      ? `第${extractQuestionNoFromId(pendingItem.questionId)}题`
      : `第${extractQuestionNoFromId(pendingItem.questionId)}题`)
  return {
    filtered: items.slice(0, cutIndex),
    droppedCount: Math.max(0, items.length - cutIndex),
    continueKey,
    reason: `${continueKey}仍有小问答案为空，判定为跨页未完成，继续等待后续页面。`,
  }
}

function matchesContinueKey(item: QuestionItem, continueKey: string) {
  const normalizedKey = normalizeDigits(String(continueKey || '')).replace(/\s+/g, '')
  if (!normalizedKey) return false
  const continueNo = extractQuestionNoFromText(continueKey)
  const itemNo = extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title)
  if (continueNo && itemNo && continueNo === itemNo) {
    return true
  }
  const compactTitle = normalizeDigits(item.title || '').replace(/\s+/g, '')
  return Boolean(compactTitle && compactTitle.includes(normalizedKey))
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
    .map((item) => Number(extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title) || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!topNos.length) {
    return false
  }
  const lastNo = topNos[topNos.length - 1]
  const hasMatched = topNos.includes(continueNo)
  const hasLater = topNos.some((value) => value > continueNo)
  return hasMatched && !hasLater && lastNo === continueNo
}

function buildBoundaryExtractorConflictRetryHint(params: {
  boundaryReason: string
  boundaryRawText?: string
  previousExtractReason?: string
  previousExtractRawText?: string
  processingStartQuestionKey?: string | null
  extractEndBeforeQuestionKey?: string | null
}) {
  const {
    boundaryReason,
    boundaryRawText = '',
    previousExtractReason = '',
    previousExtractRawText = '',
    processingStartQuestionKey = null,
    extractEndBeforeQuestionKey = null,
  } = params

  return [
    '冲突修复：边界判断已经确认当前图片队列中存在可完整入库的题目，但提取器前两轮都返回了空 questionsToUpsert。',
    `startQuestionKey=${processingStartQuestionKey || 'null'}`,
    `endBeforeQuestionKey=${extractEndBeforeQuestionKey || 'null'}`,
    boundaryReason ? `边界判断理由：${boundaryReason}` : '',
    boundaryRawText ? `边界原始输出：${boundaryRawText}` : '',
    previousExtractReason ? `上一轮提取理由：${previousExtractReason}` : '',
    previousExtractRawText ? `上一轮提取原始输出：${previousExtractRawText}` : '',
    '请重新逐张核对图片，并严格按范围输出所有完整顶层大题。',
    '如果 startQuestionKey 不为 null 且 endBeforeQuestionKey 为 null，必须继续提取起点之后所有完整顶层大题，不能只盯着起点题。',
    '只有在你能明确证明当前范围内确实没有任何完整题时，才允许返回空数组；否则必须输出题目。',
  ]
    .filter(Boolean)
    .join(' ')
}

function sameQuestionKey(a: string | null | undefined, b: string | null | undefined) {
  const aNo = extractQuestionNoFromText(String(a || ''))
  const bNo = extractQuestionNoFromText(String(b || ''))
  if (aNo && bNo) return aNo === bNo
  const aNorm = normalizeDigits(String(a || '')).replace(/\s+/g, '')
  const bNorm = normalizeDigits(String(b || '')).replace(/\s+/g, '')
  return Boolean(aNorm && bNorm && aNorm === bNorm)
}


function findCompletedPendingQuestion(items: QuestionItem[], continueKey: string) {
  const target = items.find((item) => matchesContinueKey(item, continueKey))
  if (!target) return null
  return isLikelyIncompleteForQueue(target) ? null : target
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


function findChapterByTitle(payload: TextbookJsonPayload, chapterTitle: string) {
  return payload.chapters.find(
    (item) => item.parentId === null && normalizeTitle(item.title) === normalizeTitle(chapterTitle),
  )
}

function findChapterById(payload: TextbookJsonPayload, chapterId: string) {
  return payload.chapters.find((item) => item.chapterId === chapterId)
}

function findSectionByTitle(payload: TextbookJsonPayload, parentChapterId: string, sectionTitle: string) {
  return payload.chapters.find(
    (item) => item.parentId === parentChapterId && normalizeTitle(item.title) === normalizeTitle(sectionTitle),
  )
}

function resolveSectionChapterId(payload: TextbookJsonPayload, chapterTitle: string, sectionTitle: string) {
  const chapter = findChapterByTitle(payload, chapterTitle)
  if (!chapter) return ''
  const section = findSectionByTitle(payload, chapter.chapterId, sectionTitle)
  return section?.chapterId || ''
}




async function readByDoubao(dataUrls: string[]) {
  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }

  const userContent: Array<Record<string, string>> = [
    {
      type: 'input_text',
      text:
        '请读取图片中的可见内容并逐字输出。不要总结，不要解释，不要补充，不要改写。保留原有顺序、换行和标点。',
    },
  ]

  for (const dataUrl of dataUrls) {
    userContent.push({
      type: 'input_image',
      image_url: dataUrl,
    })
  }

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: '你是一个只做逐字转写的视觉模型助手。',
          },
        ],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  if (!text) {
    throw new Error('Ark response has no text output')
  }
  return text
}


async function detectChapterBoundaryAndPendingByDoubao(params: {
  imageDataUrls: string[]
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  pendingContinueQuestionKey: string | null
  crossPageContext?: string
  retryHint?: string
}): Promise<{ question: QuestionBoundaryResult }> {
  const {
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    mode,
    processingStartQuestionKey = null,
    pendingContinueQuestionKey,
    crossPageContext = '',
    retryHint = '',
  } = params

  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }
  if (mode === 'cross_page_merge' && (imageDataUrls.length < 2 || imageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(`cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images, got ${imageDataUrls.length}`)
  }

  const instruction = [
    '你是教材页边界检测器。你只看本次传入的正式队列图片，不知道也不能推测预读页；你只做边界判断，不生成题目 JSON 内容。',
    '上下文:',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- 处理模式: ${mode}`,
    `- 当前处理起点题号: ${processingStartQuestionKey || 'null'}`,
    `- 跨页续题标记: ${pendingContinueQuestionKey || 'null'}`,
    crossPageContext ? `跨页补充上下文: ${crossPageContext}` : '',
    retryHint ? `- 额外纠偏要求: ${retryHint}` : '',
    '要求:',
    '1) 只输出边界判断 JSON，不要输出题干、答案、rubric。',
    '2) 当前处理起点题号为 null 时，表示从队列第一页实际出现的第一个顶层大题开始。',
    '3) hasExtractableQuestions 判断的是：从起点开始，到当前队列最后一页为止，是否已经出现至少一道完整可导入的顶层大题。',
    '3.5) 对 GROUP/长题，只有整道顶层大题的所有小问和答案链都闭合后，才算“完整可导入”；前几个小问完整但后续小问未结束时，整道题仍算未完成。',
    '4) needNextPage 只判断“当前处理起点题号”对应那道题是否还需要下一页；不要用最后一题替代它。',
    '5) queueTailQuestionKey 表示“当前正式队列图片中，按阅读顺序最后实际出现的顶层大题”。只要能识别，必须返回；它不是当前章的最后一题、不是当前小节的最后一题、也不是当前处理起点，除非它确实就是正式队列最后出现的题。',
    '6) 如果正式队列图片里发生了小节或章节切换，必须根据图片实际内容判断切换后最后出现的顶层大题是谁，并让 queueTailQuestionKey 使用这道尾题真实所属的小节；不能因为后端游标来自旧小节，就把旧小节题误当成正式队列尾题。',
    '7) continueQuestionKey 只判断 queueTailQuestionKey 这道正式队列尾题是否还要续到后续页；若它需要后续页，则 continueQuestionKey 返回与 queueTailQuestionKey 完全相同的定位；否则返回 null。',
    '8) queueTailQuestionKey 和 continueQuestionKey 不能是 q/ch id，也不能是小题号；格式必须是“章标题 | 小节标题 | 第几题”。',
    '8.1) “一、填空题”“二、选择题”“三、判断题”“四、计算题/证明题/解答题”等只是栏目标题或题型说明，不是顶层大题。',
    '8.2) 栏目标题下面的“1.、2.、3.”等编号题，每一道都是独立顶层大题；如果正式队列尾部停在某个栏目内的第4个编号题，queueTailQuestionKey 应返回这道第4题的定位，不要返回栏目标题。',
    '8.3) 从“填空题”切到“选择题”只是栏目变化，不等同于章节/小节切换；queueTailQuestionKey 仍按最后实际出现的编号题定位。',
    '9) 对长题必须核对小问链和答案链是否真正闭合；不能只看页面末尾像是结束了就返回不跨页。',
    '10) hasExtractableQuestions=true 与 needNextPage=true 可以同时成立；这表示起点题还没补完，但当前队列里已经有别的完整题可导入。',
    '11) 例1：起点=第2题，当前队列里第2题补完，后面第3题完整，正式队列最后出现的顶层大题是第4题且它跨页 => hasExtractableQuestions=true, needNextPage=false, queueTailQuestionKey=第4题, continueQuestionKey=第4题。',
    '12) 例2：起点=第6题，当前队列里第6题补完，后面第7题完整，且正式队列最后出现的顶层大题也已结束 => hasExtractableQuestions=true, needNextPage=false, queueTailQuestionKey=第7题, continueQuestionKey=null。',
    '13) 例3：正式队列上半仍是习题8.1第8题，下半已切到习题8.2第1题，且正式队列最后出现的顶层大题是习题8.2第1题，则 queueTailQuestionKey 必须是“第八章 不定积分 | 习题8.2 | 第1题”；如果它不跨页，continueQuestionKey 返回 null。',
    '14) 只有在你有清晰证据证明起点题已经闭合时，needNextPage 才能为 false。',
    '严格输出 JSON（不要 markdown，不要解释）：',
    '{',
    '  "question": {',
    '    "needNextPage": true/false,',
    '    "queueTailQuestionKey": "string or null",',
    '    "continueQuestionKey": "string or null",',
    '    "hasExtractableQuestions": true/false,',
    '    "reason": "string"',
    '  }',
    '}',
  ].join('\n')

  const userContent: Array<Record<string, string>> = [{ type: 'input_text', text: instruction }]
  for (const dataUrl of imageDataUrls) {
    userContent.push({ type: 'input_image', image_url: dataUrl })
  }

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Boundary output is not JSON: ${text.slice(0, 500)}`)
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

  const questionRaw =
    output.question && typeof output.question === 'object' ? (output.question as Record<string, unknown>) : {}
  const queueTailQuestionKey = readQuestionKeyField(questionRaw, [
    'queueTailQuestionKey',
    'currentQueueTailQuestionKey',
    'tailQuestionKey',
    'lastQuestionKey',
  ])
  const continueQuestionKey = readQuestionKeyField(questionRaw, ['continueQuestionKey'])

  return {
    question: {
      needNextPage: Boolean(questionRaw.needNextPage),
      queueTailQuestionKey,
      continueQuestionKey,
      hasExtractableQuestions:
        questionRaw.hasExtractableQuestions === true || questionRaw.hasExtractableQuestion === true,
      reason: typeof questionRaw.reason === 'string' ? questionRaw.reason : '',
      rawText: text,
    },
  }
}

async function detectChapterAndQuestionsByDoubao(params: {
  imageDataUrls: string[]
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  afterSwitchMode: boolean
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  extractEndBeforeQuestionKey?: string | null
  retryHint?: string
  answerHandlingMode?: boolean | AnswerHandlingMode
  questionSelectionMode?: 'complete_only' | 'all_visible'
  fixedChapterSection?: boolean
  allowLargeImageBatch?: boolean
}): Promise<CombinedExtractResult> {
  const {
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    afterSwitchMode,
    mode,
    processingStartQuestionKey = null,
    extractEndBeforeQuestionKey = null,
    retryHint,
    answerHandlingMode = 'extract_visible',
    questionSelectionMode = 'complete_only',
    fixedChapterSection = false,
    allowLargeImageBatch = false,
  } = params

  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }
  if (!allowLargeImageBatch && mode === 'cross_page_merge' && (imageDataUrls.length < 2 || imageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(
      `cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images, got ${imageDataUrls.length}`,
    )
  }

  const instruction = [
    '你是教材结构化提取器，一次同时输出 chapter 与 question 两部分 JSON。',
    '上下文:',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- afterSwitchMode: ${afterSwitchMode ? 'true' : 'false'}`,
    `- 处理模式: ${mode}`,
    '本轮提取范围（严格遵守）:',
    `{ "startQuestionKey": ${JSON.stringify(processingStartQuestionKey || null)}, "endBeforeQuestionKey": ${JSON.stringify(extractEndBeforeQuestionKey || null)} }`,
    retryHint ? `重试提示: ${retryHint}` : '',
    '章节规则:',
    ...(fixedChapterSection
      ? [
          '1) 本次章标题和小节标题完全以用户给定值为准，禁止根据图片自行切换章节或小节。',
          '2) 所有题目的 chapterId 都必须固定使用当前小节 chapterId。',
          '3) chapter.chapterTitle、chapter.sectionTitle、chapter.switchSectionTitle 一律返回 null。',
        ]
      : [
          '1) 后端传入的当前章标题、当前小节标题和 chapterId 只是处理游标/默认上下文，不是题目归属的最终依据；每道题的真实归属以正式队列图片中实际出现的章节/小节标题和位置为准。',
          '2) 本助手只接收正式队列图片，不接收预读页；不得推测下一页会切到哪个小节。',
          '3) 如果正式队列图片里没有实际出现新章节/小节标题，则 chapterTitle/sectionTitle/switchSectionTitle 返回 null，并按当前游标归属。',
          '4) 如果正式队列图片中途切到新章节或新小节，切换点之前的题保持旧章/旧小节，切换点之后的题必须改用新章/新小节编号，并如实写入 chapter 字段，供后端更新 chapters 树。',
          '5) switchSectionTitle 只表示正式队列里已经实际出现小节切换，用来通知后端更新游标；它不是给切换前题目强行改小节的依据。',
          '6) 每道题都必须写入它实际所属小节的 chapterId；切换前题目用当前小节 chapterId，切换后题目用新小节 chapterId。',
          '7) chapter.chapterTitle 只能填写纯章标题，例如“第九章 定积分”；chapter.sectionTitle 和 switchSectionTitle 只能填写纯小节标题，例如“习题9.1”。',
          '8) chapter 字段中严禁输出“章标题 | 小节标题”这类组合串；这种组合格式只允许用于题目定位字段，不允许用于章节树字段。',
        ]),
    '题目规则:',
    questionSelectionMode === 'all_visible'
      ? '1) 本次为无答案教材单页直提，不做跨页完整性判断；当前页出现的所有习题都要提取。若题目在页首或页尾被截断，也按当前页可见内容输出，不要等待下一页。'
      : '1) 只提取给定范围内在图片上完整可见的顶层大题；未完整显示的题不要输出。',
    '2) startQuestionKey=null 时，从队列第一页实际出现的第一个顶层大题开始。',
    '3) endBeforeQuestionKey!=null 时，只提取到该题之前；该题本身严禁输出。',
    '4) endBeforeQuestionKey=null 时，必须提取从 startQuestionKey 开始到当前队列末尾之间所有完整顶层大题；绝不能自行制造新的截止题号，也绝不能只提取起点题。',
    '5) startQuestionKey 与 endBeforeQuestionKey 指向同一道题时，不表示空范围；表示当前正在续这道题。若它在当前队列里已完整结束，就输出它；否则不要输出。',
    '6) 典型场景：起点=第2题，截止=第4题，当前队列里第2题已完整、后面第3题完整 => 必须同时输出第2题和第3题，不输出第4题。',
    '7) 典型场景：起点=第6题，截止=null，当前队列里第6题已完整、后面第7题完整 => 必须同时输出第6题和第7题。',
    questionSelectionMode === 'all_visible'
      ? '8) 因为本次答案需要由模型生成，所以不要再根据答案是否跨页来决定是否丢题；题干以当前页可见内容为准。'
      : '',
    questionSelectionMode === 'all_visible'
      ? '9) 本次单页直提时，如与通用“完整性”约束冲突，以“当前页所有习题都要提取”为准。'
      : '',
    ...buildSharedQuestionContentRuleLines(
      questionSelectionMode === 'all_visible' ? 10 : 8,
      'questionsToUpsert',
      answerHandlingMode,
    ),
    ...buildSharedQuestionStructureInstructionLines(answerHandlingMode),
    '严格输出 JSON（不要 markdown，不要解释）：',
    '{',
    '  "chapter": {',
    '    "chapterTitle": "string or null",',
    '    "sectionTitle": "string or null",',
    '    "switchSectionTitle": "string or null",',
    '    "needReprocessSameImage": true/false,',
    '    "reason": "string"',
    '  },',
    '  "question": {',
    '    "questionsToUpsert": [ ...question objects... ],',
    '    "reason": "string"',
    '  }',
    '}',
  ].join('\n')

  const userContent: Array<Record<string, string>> = [{ type: 'input_text', text: instruction }]
  for (const dataUrl of imageDataUrls) {
    userContent.push({ type: 'input_image', image_url: dataUrl })
  }

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Model output is not JSON: ${text.slice(0, 500)}`)
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
      try {
        output = await repairModelJsonByDoubao({
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
  const chapterReasonRaw =
    (typeof chapterNode.reason === 'string' && chapterNode.reason) ||
    (typeof output.reason === 'string' && output.reason) ||
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
  const questionReasonRaw =
    (typeof questionNode.reason === 'string' && questionNode.reason) ||
    (typeof output.reason === 'string' && output.reason) ||
    (dataNode && typeof dataNode.reason === 'string' ? dataNode.reason : '')

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
      reason: typeof chapterReasonRaw === 'string' ? chapterReasonRaw : '',
    },
    question: {
      questionsToUpsert: questionsCandidate,
      needNextPage: false,
      continueQuestionKey: null,
      reason: typeof questionReasonRaw === 'string' ? questionReasonRaw : '',
      rawText: text,
    },
  }
}

async function detectLastQuestionContinuationWithLookaheadByDoubao(params: {
  queueImageDataUrls: string[]
  lookaheadImageDataUrl: string
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  boundaryQueueTailQuestionKey: string | null
  lookaheadImageLabel?: string | null
  retryHint?: string | null
}): Promise<LastQuestionLookaheadResult> {
  const {
    queueImageDataUrls,
    lookaheadImageDataUrl,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    boundaryQueueTailQuestionKey,
    lookaheadImageLabel = null,
    retryHint = null,
  } = params

  const instruction = [
    '你是最后一题续页确认器。你会看到前N张正式队列图片和最后1张预读图；正式队列事实只能来自前N张图，预读图只用于判断正式队列尾题是否延续。',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- 边界助手识别的正式队列尾题: ${boundaryQueueTailQuestionKey || 'null'}`,
    `- 预读页: ${lookaheadImageLabel || 'next_page_preview'}`,
    '规则:',
    '1) 前N张图才是当前队列；最后1张图只是下一页预读图，不属于当前队列，绝不能把预读图中的任何内容算进当前队列的完整性。',
    '2) 你必须先只根据前N张正式队列图片，识别 queueTailQuestionKey，即“正式队列里按阅读顺序最后实际出现的那一道顶层大题”；严禁把最后这张预读图里的题号或小节算进 queueTailQuestionKey。',
    '3) queueTailQuestionKey 必须使用这道正式队列尾题真实所属的小节；如果正式队列里没有出现新小节，不能因为预读图出现新小节就说当前队列已切换。',
    '3.1) “一、填空题”“二、选择题”“三、判断题”“四、计算题/证明题/解答题”等只是栏目标题或题型说明，不是顶层大题。',
    '3.2) 栏目标题下面的“1.、2.、3.”等编号题，每一道都是独立顶层大题；如果正式队列最后停在某个栏目内的编号题上，queueTailQuestionKey 返回这道编号题的定位，预读图只能判断这道编号题是否继续。',
    '4) 识别 queueTailQuestionKey 后，与边界助手识别的正式队列尾题对比；如果不一致，保留你只看正式队列得到的 queueTailQuestionKey，continueQuestionKey 返回 null，并在 reason 说明不一致。',
    '5) 只有当 queueTailQuestionKey 与边界助手尾题一致时，才允许查看预读图，并且只判断这同一道题是否继续到了预读页；不得用预读图去补齐当前队列、也不得据此把当前队列判成完整。',
    '6) 如果预读图页首仍在继续这道正式队列尾题，则 continueQuestionKey 必须返回与 queueTailQuestionKey 完全相同的定位。',
    '7) 如果正式队列尾题的后续小问、后续答案、收尾结论只出现在预读图里，这说明正式队列未完成，continueQuestionKey 必须返回 queueTailQuestionKey，不能返回 null。',
    '8) 如果预读图没有继续这道正式队列尾题，则 continueQuestionKey 返回 null。',
    '9) 预读图里出现的新题、后续题、其他更大的题号，统统不能当作正式队列最后一题，也不能直接当作 continueQuestionKey。',
    '10) 典型场景：若正式队列实际只到第3题，预读页里后面又出现第4题、第5题，也绝不能把第5题当成正式队列最后一题；你只能判断第3题是否在预读页继续。',
    '11) 典型场景：当前队列里第1题只完整到前7个小问，而第8-10小问在预读页里才出现；这种情况下 queueTailQuestionKey 和 continueQuestionKey 都必须仍然是第1题，因为预读页不属于正式队列。',
    '12) reason 必须分两步写清楚：先说明“仅看前N张正式队列图”识别出的最后一题，再说明它与边界助手尾题是否一致、预读页页首是否继续这道题；不得只根据预读页内容倒推。',
    retryHint ? `重判要求: ${retryHint}` : '',
    '严格输出 JSON：',
    '{',
    '  "question": {',
    '    "queueTailQuestionKey": "string or null",',
    '    "continueQuestionKey": "string or null",',
    '    "reason": "string"',
    '  }',
    '}',
  ].join('\n')

  const userContent: Array<Record<string, string>> = [{ type: 'input_text', text: instruction }]
  for (const dataUrl of queueImageDataUrls) {
    userContent.push({ type: 'input_image', image_url: dataUrl })
  }
  userContent.push({ type: 'input_image', image_url: lookaheadImageDataUrl })

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
      },
      {
        role: 'user',
        content: userContent,
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
  const queueTailQuestionKey = readQuestionKeyField(questionRaw, [
    'queueTailQuestionKey',
    'currentQueueTailQuestionKey',
    'tailQuestionKey',
    'lastQuestionKey',
  ])
  const continueQuestionKey = readQuestionKeyField(questionRaw, ['continueQuestionKey'])

  return {
    queueTailQuestionKey,
    continueQuestionKey,
    reason: typeof questionRaw.reason === 'string' ? questionRaw.reason : '',
    rawText: text,
  }
}

async function detectQuestionsByDoubao(params: {
  imageDataUrls: string[]
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  mode: 'single_page' | 'cross_page_merge'
  retryHint?: string
}): Promise<QuestionExtractResult> {
  const {
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    mode,
    retryHint,
  } = params

  const combined = await detectChapterAndQuestionsByDoubao({
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    afterSwitchMode: false,
    mode,
    retryHint,
  })

  return combined.question
}

async function appendChapterSegmentFromImages(params: {
  jsonFilePath: string
  chapterTitle: string
  sectionTitle: string
  imageDataUrls: string[]
  imageLabels?: string[]
}) {
  const {
    jsonFilePath,
    chapterTitle,
    sectionTitle,
    imageDataUrls,
    imageLabels = [],
  } = params

  const payload = await loadTextbookJson(jsonFilePath)
  const normalizedChapterTitle = normalizeTitle(chapterTitle)
  const normalizedSectionTitle = normalizeTitle(sectionTitle)
  const chapter = ensureTopChapter(payload, normalizedChapterTitle)
  const section = ensureSectionChapter(payload, chapter.chapterId, normalizedSectionTitle)
  const answerHandlingMode = getPayloadAnswerHandlingMode(payload)
  const questionSelectionMode = answerHandlingMode === 'extract_visible' ? 'complete_only' : 'all_visible'
  const mode: 'single_page' | 'cross_page_merge' = imageDataUrls.length > 1 ? 'cross_page_merge' : 'single_page'

  const extractDetect = await detectChapterAndQuestionsByDoubao({
    imageDataUrls,
    currentChapterTitle: normalizedChapterTitle,
    currentSectionTitle: normalizedSectionTitle,
    currentSectionChapterId: section.chapterId,
    afterSwitchMode: false,
    mode,
    answerHandlingMode,
    questionSelectionMode,
    fixedChapterSection: true,
    allowLargeImageBatch: true,
  })

  const rawQuestions = Array.isArray(extractDetect.question.questionsToUpsert)
    ? extractDetect.question.questionsToUpsert
    : []
  if (!rawQuestions.length) {
    throw new Error(extractDetect.question.reason || '当前片段没有提取到可写入的题目')
  }

  let normalizedQuestions = rawQuestions
    .map((item) =>
      normalizeQuestionItem(item, section.chapterId, normalizedSectionTitle, {
        answerHandlingMode,
      }),
    )
    .filter(Boolean) as QuestionItem[]
  normalizedQuestions = rewriteQuestionTitlesByResolvedChapter(payload, normalizedQuestions)

  const pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)
  upsertQuestionsById(payload, normalizedQuestions)
  await appendPendingReviewLogs('manual_segment', pendingReviewLogs)
  await saveTextbookJson(jsonFilePath, payload)

  return {
    message: 'success',
    jsonFilePath,
    currentChapterTitle: normalizedChapterTitle,
    currentSectionTitle: normalizedSectionTitle,
    currentSectionChapterId: section.chapterId,
    chaptersCount: payload.chapters.length,
    questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
    question: {
      pending: false,
      reason: extractDetect.question.reason || '',
      processingStartQuestionKey: null,
      nextStartQuestionKey: null,
      pendingPagesCount: 0,
      pendingPageLabels: [],
      upsertedCount: normalizedQuestions.length,
      pendingReviewCount: pendingReviewLogs.length,
      droppedPendingQuestionCount: 0,
      boundaryHasExtractableQuestions: rawQuestions.length > 0,
      boundaryNeedNextPage: false,
      boundaryContinueQuestionKey: null,
      boundaryLookaheadLabel: null,
      boundaryLookaheadReason: '手工分段模式按整段图片一次处理，不做预读判断。',
      boundaryReason: '手工分段模式固定章/小节并按整段图片一次提取。',
      extractReason: extractDetect.question.reason || '',
      retryExtractReason: '',
      integrityRetryReason: '',
      rangeRetryReason: '',
      extractReturnedCount: rawQuestions.length,
      normalizedCount: normalizedQuestions.length,
      sessionStoredProcessingStartQuestionKey: null,
      sessionStoredPendingContinueQuestionKey: null,
      effectiveProcessingStartQuestionKey: null,
      effectiveExtractEndBeforeQuestionKey: null,
      effectiveExtractMode: 'manual_segment',
      integrityFixRetried: false,
      pendingReviewFixRetried: false,
      rangeFixRetried: false,
      rangeMismatchBlocked: false,
      rawText: extractDetect.question.rawText,
      retried: false,
    },
    segment: {
      chapterTitle: normalizedChapterTitle,
      sectionTitle: normalizedSectionTitle,
      imageCount: imageDataUrls.length,
      imageLabels: imageLabels.filter((item) => typeof item === 'string' && item.trim()),
      upsertedCount: normalizedQuestions.length,
    },
    passLogs: [
      {
        pass: 1,
        chapterTitle: normalizedChapterTitle,
        sectionTitle: normalizedSectionTitle,
        switched: false,
        needReprocessSameImage: false,
        reason: '手工分段模式固定章节与小节',
        question: {
          mode: 'manual_segment',
          pending: false,
          reason: extractDetect.question.reason || '',
          upsertedCount: normalizedQuestions.length,
          extractReturnedCount: rawQuestions.length,
          normalizedCount: normalizedQuestions.length,
          imageCount: imageDataUrls.length,
          imageLabels: imageLabels.filter((item) => typeof item === 'string' && item.trim()),
        },
      },
    ],
  }
}

async function processChapterSessionImage(params: {
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
  const session = await getChapterSession(sessionId)
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
  const questionSession = (await getQuestionSession(sessionId)) || {
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
  const answerHandlingMode = getPayloadAnswerHandlingMode(payload)
  const sessionStoredProcessingStartQuestionKey = questionSession.processingStartQuestionKey
  const sessionStoredPendingContinueQuestionKey = questionSession.pendingContinueQuestionKey

  if (answerHandlingMode !== 'extract_visible') {
    const extractDetect = await detectChapterAndQuestionsByDoubao({
      imageDataUrls: [imageDataUrl],
      currentChapterTitle: activeChapterTitle,
      currentSectionTitle: activeSectionTitle,
      currentSectionChapterId: activeSectionChapterId,
      afterSwitchMode: false,
      mode: 'single_page',
      answerHandlingMode,
      questionSelectionMode: 'all_visible',
    })

    let chapterTitle = extractDetect.chapter.chapterTitle || activeChapterTitle
    let sectionTitle = extractDetect.chapter.sectionTitle || activeSectionTitle
    const switchSectionTitle = extractDetect.chapter.switchSectionTitle
    let chapter = ensureTopChapter(payload, chapterTitle)
    let section = ensureSectionChapter(payload, chapter.chapterId, sectionTitle)
    activeChapterTitle = chapterTitle
    activeSectionTitle = sectionTitle
    activeSectionChapterId = section.chapterId

    let switched = false
    if (switchSectionTitle && normalizeTitle(switchSectionTitle) !== normalizeTitle(activeSectionTitle)) {
      const switchedSection = ensureSectionChapter(payload, chapter.chapterId, switchSectionTitle)
      activeSectionTitle = normalizeTitle(switchSectionTitle)
      activeSectionChapterId = switchedSection.chapterId
      switched = true
    }

    const rawQuestions = Array.isArray(extractDetect.question.questionsToUpsert)
      ? extractDetect.question.questionsToUpsert
      : []
    let normalizedQuestions = rawQuestions
      .map((item) =>
        normalizeQuestionItem(item, section.chapterId, sectionTitle, {
          answerHandlingMode,
          forceFallbackChapterId: false,
        }),
      )
      .filter(Boolean) as QuestionItem[]
    normalizedQuestions = rewriteQuestionTitlesByResolvedChapter(payload, normalizedQuestions)

    const pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)
    upsertQuestionsById(payload, normalizedQuestions)
    await appendPendingReviewLogs(sessionId, pendingReviewLogs)

    questionSession.currentChapterTitle = activeChapterTitle
    questionSession.currentSectionTitle = activeSectionTitle
    questionSession.currentSectionChapterId = activeSectionChapterId
    questionSession.pendingPageDataUrls = []
    questionSession.pendingPageLabels = []
    questionSession.pendingContinueQuestionKey = null
    questionSession.processingStartQuestionKey = null
    questionSession.pendingReason = null
    questionSession.pendingUpsertedCount = 0

    passLogs.push({
      pass: 1,
      chapterTitle: activeChapterTitle,
      sectionTitle,
      switchSectionTitle: switchSectionTitle ?? null,
      switched,
      needReprocessSameImage: false,
      reason: extractDetect.chapter.reason,
      question: {
        mode: 'single_page_no_answer_direct',
        pending: false,
        reason: extractDetect.question.reason,
        processingStartQuestionKey: null,
        nextStartQuestionKey: null,
        continueQuestionKey: null,
        upsertedCount: normalizedQuestions.length,
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: 0,
        pendingPageLabels: [],
        boundaryHasExtractableQuestions: rawQuestions.length > 0,
        boundaryNeedNextPage: false,
        boundaryContinueQuestionKey: null,
        boundaryLookaheadLabel: null,
        boundaryLookaheadReason: '无答案教材跳过预读判断，直接按当前页提取所有习题。',
        boundaryReason: '无答案教材跳过跨页边界判断，直接按当前页提取所有习题。',
        extractReason: extractDetect.question.reason,
        retryExtractReason: '',
        integrityRetryReason: '',
        rangeRetryReason: '',
        extractReturnedCount: rawQuestions.length,
        normalizedCount: normalizedQuestions.length,
        sessionStoredProcessingStartQuestionKey,
        sessionStoredPendingContinueQuestionKey,
        effectiveProcessingStartQuestionKey: null,
        effectiveExtractEndBeforeQuestionKey: null,
        effectiveExtractMode: 'single_page_no_answer_direct',
        integrityFixRetried: false,
        pendingReviewFixRetried: false,
        rangeFixRetried: false,
        rangeMismatchBlocked: false,
        rawText: extractDetect.question.rawText,
        retried: false,
      },
    })

    const activeTopChapter = ensureTopChapter(payload, activeChapterTitle)
    const activeSection = ensureSectionChapter(payload, activeTopChapter.chapterId, activeSectionTitle)

    await saveTextbookJson(session.jsonFilePath, payload)
    session.currentChapterTitle = activeChapterTitle
    session.currentSectionTitle = activeSectionTitle
    session.updatedAt = new Date().toISOString()
    await setChapterSession(sessionId, session)
    questionSession.updatedAt = new Date().toISOString()
    await setQuestionSession(sessionId, questionSession)

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
      question: {
        pending: false,
        reason: extractDetect.question.reason,
        processingStartQuestionKey: null,
        nextStartQuestionKey: null,
        pendingPagesCount: 0,
        pendingPageLabels: [],
        upsertedCount: normalizedQuestions.length,
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: 0,
        boundaryHasExtractableQuestions: rawQuestions.length > 0,
        boundaryNeedNextPage: false,
        boundaryContinueQuestionKey: null,
        boundaryLookaheadLabel: null,
        boundaryLookaheadReason: '无答案教材跳过预读判断，直接按当前页提取所有习题。',
        boundaryReason: '无答案教材跳过跨页边界判断，直接按当前页提取所有习题。',
        extractReason: extractDetect.question.reason,
        retryExtractReason: '',
        integrityRetryReason: '',
        rangeRetryReason: '',
        extractReturnedCount: rawQuestions.length,
        normalizedCount: normalizedQuestions.length,
        sessionStoredProcessingStartQuestionKey,
        sessionStoredPendingContinueQuestionKey,
        effectiveProcessingStartQuestionKey: null,
        effectiveExtractEndBeforeQuestionKey: null,
        effectiveExtractMode: 'single_page_no_answer_direct',
        integrityFixRetried: false,
        pendingReviewFixRetried: false,
        rangeFixRetried: false,
        rangeMismatchBlocked: false,
        questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
        rawText: extractDetect.question.rawText,
        retried: false,
      },
    }
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
  let pendingContinueQuestionKey = questionSession.pendingContinueQuestionKey
  const processingStartQuestionKey =
    questionSession.processingStartQuestionKey || questionSession.pendingContinueQuestionKey
  const mode: 'single_page' | 'cross_page_merge' = pendingPageDataUrls.length ? 'cross_page_merge' : 'single_page'
  const questionImageDataUrls = pendingPageDataUrls.length
    ? [...pendingPageDataUrls, imageDataUrl]
    : [imageDataUrl]
  const questionImageLabels = pendingPageLabels.length ? [...pendingPageLabels, imageLabel || 'current'] : [imageLabel || 'current']
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

  let boundaryDetect = await detectChapterBoundaryAndPendingByDoubao({
    imageDataUrls: questionImageDataUrls,
    currentChapterTitle: activeChapterTitle,
    currentSectionTitle: activeSectionTitle,
    currentSectionChapterId: activeSectionChapterId,
    mode,
    processingStartQuestionKey,
    pendingContinueQuestionKey,
    crossPageContext,
  })
  let boundaryRetryReason = ''
  const boundaryScopeMismatch = detectBoundaryReasonScopeMismatch({
    boundaryReason: boundaryDetect.question.reason,
    processingStartQuestionKey,
  })
  if (boundaryScopeMismatch.shouldRetry) {
    const boundaryRetryDetect = await detectChapterBoundaryAndPendingByDoubao({
      imageDataUrls: questionImageDataUrls,
      currentChapterTitle: activeChapterTitle,
      currentSectionTitle: activeSectionTitle,
      currentSectionChapterId: activeSectionChapterId,
      mode,
      processingStartQuestionKey,
      pendingContinueQuestionKey,
      crossPageContext,
      retryHint: `${boundaryScopeMismatch.reason} 从当前处理起点开始判断 hasExtractableQuestions 和 needNextPage，不要再把起点之前的题算入当前范围。`,
    })
    boundaryRetryReason = boundaryRetryDetect.question.reason || ''
    boundaryDetect = boundaryRetryDetect
  }

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

  const boundaryContinueKey = resolveContinueQuestionKey(boundaryDetect.question.continueQuestionKey)
  const boundaryQueueTailQuestionKey =
    resolveContinueQuestionKey(boundaryDetect.question.queueTailQuestionKey) || boundaryContinueKey || null
  let effectiveBoundaryContinueKey: string | null = boundaryContinueKey || null
  let lookaheadAdjustedContinueQuestionKey: string | null = boundaryContinueKey || null
  let lookaheadQueueTailQuestionKey: string | null = null
  let boundaryLookaheadReason = ''
  if (lookaheadImageDataUrl && boundaryQueueTailQuestionKey) {
    try {
      let lookaheadDetect = await detectLastQuestionContinuationWithLookaheadByDoubao({
        queueImageDataUrls: questionImageDataUrls,
        lookaheadImageDataUrl,
        currentChapterTitle: activeChapterTitle,
        currentSectionTitle: activeSectionTitle,
        currentSectionChapterId: activeSectionChapterId,
        boundaryQueueTailQuestionKey,
        lookaheadImageLabel: lookaheadImageLabel || null,
      })
      boundaryLookaheadReason = lookaheadDetect.reason || ''
      lookaheadQueueTailQuestionKey = resolveContinueQuestionKey(lookaheadDetect.queueTailQuestionKey) || null
      let lookaheadContinueKey = resolveContinueQuestionKey(lookaheadDetect.continueQuestionKey) || null
      let lookaheadDecision = shouldAcceptLookaheadContinueQuestionKey({
        lookaheadTailQuestionKey: lookaheadQueueTailQuestionKey,
        boundaryQueueTailQuestionKey,
        lookaheadContinueKey,
        boundaryContinueKey,
        boundaryReason: boundaryDetect.question.reason,
        currentSectionTitle: activeSectionTitle,
      })
      if (!lookaheadDecision.accepted) {
        const retryDetect = await detectLastQuestionContinuationWithLookaheadByDoubao({
          queueImageDataUrls: questionImageDataUrls,
          lookaheadImageDataUrl,
          currentChapterTitle: activeChapterTitle,
          currentSectionTitle: activeSectionTitle,
          currentSectionChapterId: activeSectionChapterId,
          boundaryQueueTailQuestionKey,
          lookaheadImageLabel: lookaheadImageLabel || null,
          retryHint:
            `${lookaheadDecision.reason} 请重新只看前N张正式队列图来复核 queueTailQuestionKey；它应与边界助手尾题一致。预读页只能用于判断这道题是否延续，不能引入预读页的新题号或新小节。`,
        })
        lookaheadDetect = retryDetect
        lookaheadQueueTailQuestionKey = resolveContinueQuestionKey(lookaheadDetect.queueTailQuestionKey) || null
        lookaheadContinueKey = resolveContinueQuestionKey(lookaheadDetect.continueQuestionKey) || null
        boundaryLookaheadReason = [boundaryLookaheadReason, `重判: ${lookaheadDetect.reason || ''}`]
          .filter(Boolean)
          .join(' | ')
        lookaheadDecision = shouldAcceptLookaheadContinueQuestionKey({
          lookaheadTailQuestionKey: lookaheadQueueTailQuestionKey,
          boundaryQueueTailQuestionKey,
          lookaheadContinueKey,
          boundaryContinueKey,
          boundaryReason: boundaryDetect.question.reason,
          currentSectionTitle: activeSectionTitle,
        })
      }
      if (lookaheadDecision.accepted) {
        effectiveBoundaryContinueKey = lookaheadContinueKey
        lookaheadAdjustedContinueQuestionKey = effectiveBoundaryContinueKey
      } else {
        boundaryLookaheadReason = [boundaryLookaheadReason, lookaheadDecision.reason].filter(Boolean).join(' | ')
        effectiveBoundaryContinueKey = boundaryContinueKey || null
        lookaheadAdjustedContinueQuestionKey = effectiveBoundaryContinueKey
      }
    } catch (error) {
      boundaryLookaheadReason = error instanceof Error ? `预读判断失败: ${error.message}` : `预读判断失败: ${String(error)}`
    }
  } else if (lookaheadImageDataUrl) {
    boundaryLookaheadReason = '边界助手未返回正式队列尾题，跳过预读判断。'
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
    const extractDetect = await detectChapterAndQuestionsByDoubao({
      imageDataUrls: questionImageDataUrls,
      currentChapterTitle: chapterTitle,
      currentSectionTitle: sectionTitle,
      currentSectionChapterId: section.chapterId,
      afterSwitchMode: false,
      mode,
      processingStartQuestionKey,
      extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
      answerHandlingMode,
    })
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
      const retryDetect = await detectChapterAndQuestionsByDoubao({
        imageDataUrls: questionImageDataUrls,
        currentChapterTitle: chapterTitle,
        currentSectionTitle: sectionTitle,
        currentSectionChapterId: section.chapterId,
        afterSwitchMode: false,
        mode,
        processingStartQuestionKey,
        extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
        answerHandlingMode,
        retryHint:
          '边界判断已确认当前队列存在可完整入库的题目。请严格按起点开始提取，只输出可入库范围内的完整题，禁止输出跨页题。',
      })
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
      const conflictRetryDetect = await detectChapterAndQuestionsByDoubao({
        imageDataUrls: questionImageDataUrls,
        currentChapterTitle: chapterTitle,
        currentSectionTitle: sectionTitle,
        currentSectionChapterId: section.chapterId,
        afterSwitchMode: false,
        mode,
        processingStartQuestionKey,
        extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
        answerHandlingMode,
        retryHint: buildBoundaryExtractorConflictRetryHint({
          boundaryReason: boundaryDetect.question.reason,
          boundaryRawText: boundaryDetect.question.rawText,
          previousExtractReason: retryExtractReason || extractReason,
          previousExtractRawText: finalQuestionDetect.rawText,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
        }),
      })
      finalQuestionDetect = {
        ...conflictRetryDetect.question,
        needNextPage: Boolean(effectiveBoundaryContinueKey),
        continueQuestionKey: effectiveBoundaryContinueKey || null,
        reason: boundaryDetect.question.reason || conflictRetryDetect.question.reason,
      }
      retryExtractReason = [retryExtractReason, conflictRetryDetect.question.reason].filter(Boolean).join(' | ')
      chapterDetect = conflictRetryDetect.chapter
      questionsRaw = finalQuestionDetect.questionsToUpsert
      extractReturnedCount = Array.isArray(questionsRaw) ? questionsRaw.length : 0
      retried = true
    }

    if (!questionsRaw.length) {
      throw new Error('Boundary detected extractable questions, but extractor returned no questions after conflict repair')
    }

    const normalizedQuestionsAll = questionsRaw
      .map((item) =>
        normalizeQuestionItem(item, section.chapterId, sectionTitle, {
          answerHandlingMode,
          forceFallbackChapterId: false,
        }),
      )
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
        const rangeRetryDetect = await detectChapterAndQuestionsByDoubao({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          answerHandlingMode,
          retryHint: `${rangeMismatch.reason} 结构化范围约束：endBeforeQuestionKey=${effectiveBoundaryContinueKey || 'null'}。如果 endBeforeQuestionKey 为 null，严禁把 startQuestionKey 当作截止题号，必须继续提取起点之后所有完整顶层大题。`,
        })
        rangeRetryReason = rangeRetryDetect.question.reason || ''
        const rangeRetryRaw = rangeRetryDetect.question.questionsToUpsert
        const rangeRetryNormalized = rangeRetryRaw
          .map((item) =>
            normalizeQuestionItem(item, section.chapterId, sectionTitle, {
              answerHandlingMode,
              forceFallbackChapterId: false,
            }),
          )
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
        const fixDetect = await detectChapterAndQuestionsByDoubao({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          answerHandlingMode,
          retryHint: `上一轮提取结果含有 ${pendingReviewLogs.length} 处【待校对】。请重新看图并仅修复这些位置，严格保持提取范围不变。`,
        })
        const fixRaw = fixDetect.question.questionsToUpsert
        const fixAll = fixRaw
          .map((item) =>
            normalizeQuestionItem(item, section.chapterId, sectionTitle, {
              answerHandlingMode,
              forceFallbackChapterId: false,
            }),
          )
          .filter(Boolean) as QuestionItem[]
        const fixNormalized = fixAll
        const fixPendingLogs = collectPendingReviewLogs(fixNormalized)
        if (fixNormalized.length && fixPendingLogs.length <= pendingReviewLogs.length) {
          normalizedQuestions = fixNormalized
          normalizedCount = normalizedQuestions.length
          pendingReviewLogs = fixPendingLogs
          finalQuestionDetect.rawText = fixDetect.question.rawText
          pendingFiltered = {
            filtered: fixNormalized,
            droppedCount: 0,
          }
        }
      } catch {
        // Ignore fix attempt failure and keep first extraction result.
      }
    }

    const integrityCheckOptions = {
      expectAnswer: true,
      allowBlankCodeAnswer: false,
    }
    let integrityIssue = rangeMismatchBlocked ? null : detectQuestionIntegrityIssue(normalizedQuestions, integrityCheckOptions)
    if (!rangeMismatchBlocked && integrityIssue) {
      integrityFixRetried = true
      try {
        const integrityRetryDetect = await detectChapterAndQuestionsByDoubao({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          answerHandlingMode,
          retryHint: `上一轮提取结果不完整：${integrityIssue.reason}。请重新看图，完整输出这道题所有可见小问和答案；若仍未完整结束则不要输出这道题。`,
        })
        const integrityRetryRaw = integrityRetryDetect.question.questionsToUpsert
        const integrityRetryNormalized = integrityRetryRaw
          .map((item) =>
            normalizeQuestionItem(item, section.chapterId, sectionTitle, {
              answerHandlingMode,
              forceFallbackChapterId: false,
            }),
          )
          .filter(Boolean) as QuestionItem[]
        const retriedIssue = detectQuestionIntegrityIssue(integrityRetryNormalized, integrityCheckOptions)
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

    const unresolvedIntegrityIssue = rangeMismatchBlocked ? null : detectQuestionIntegrityIssue(normalizedQuestions, integrityCheckOptions)
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
      boundaryQueueTailQuestionKey,
      boundaryContinueQuestionKey: boundaryContinueKey || null,
      lookaheadQueueTailQuestionKey,
      lookaheadAdjustedContinueQuestionKey,
      boundaryLookaheadLabel: lookaheadImageLabel || null,
      boundaryLookaheadReason,
      pendingReviewFixRetried,
      integrityFixRetried,
      rangeFixRetried,
      rangeMismatchBlocked,
      boundaryReason: boundaryDetect.question.reason,
      boundaryRetryReason,
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
        upsertedQuestionTitles: normalizedQuestions.map((item) => item.title || item.questionId),
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: pendingFiltered.droppedCount,
        boundaryHasExtractableQuestions: boundaryDetect.question.hasExtractableQuestions,
        boundaryNeedNextPage: boundaryDetect.question.needNextPage,
        boundaryQueueTailQuestionKey,
        boundaryContinueQuestionKey: boundaryContinueKey || null,
        lookaheadQueueTailQuestionKey,
        lookaheadAdjustedContinueQuestionKey,
        boundaryLookaheadLabel: lookaheadImageLabel || null,
        boundaryLookaheadReason,
        boundaryReason: boundaryDetect.question.reason,
        boundaryRetryReason,
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
        upsertedQuestionTitles: normalizedQuestions.map((item) => item.title || item.questionId),
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: pendingFiltered.droppedCount,
        boundaryHasExtractableQuestions: boundaryDetect.question.hasExtractableQuestions,
        boundaryNeedNextPage: boundaryDetect.question.needNextPage,
        boundaryQueueTailQuestionKey,
        boundaryContinueQuestionKey: boundaryContinueKey || null,
        lookaheadQueueTailQuestionKey,
        lookaheadAdjustedContinueQuestionKey,
        boundaryLookaheadLabel: lookaheadImageLabel || null,
        boundaryLookaheadReason,
        boundaryReason: boundaryDetect.question.reason,
        boundaryRetryReason,
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
        questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
        rawText: finalQuestionDetect.rawText,
        retried,
      }

  await saveTextbookJson(session.jsonFilePath, payload)
  session.currentChapterTitle = activeChapterTitle
  session.currentSectionTitle = activeSectionTitle
  session.updatedAt = new Date().toISOString()
  await setChapterSession(sessionId, session)
  questionSession.updatedAt = new Date().toISOString()
  await setQuestionSession(sessionId, questionSession)

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
  }
}
ensureDir(UPLOAD_DIR)
ensureDir(OUTPUT_DIR)
ensureDir(OUTPUT_JSON_DIR)
ensureDir(MERGED_JSON_DIR)
ensureDir(READ_RESULTS_DIR)

export {
  appendChapterSegmentFromImages,
  normalizeJsonPath,
  processChapterSessionImage,
  readByDoubao,
}

