import { ARK_MODEL } from './config'
import {
  loadQuestionBankTopLevelQuestionsByIds,
} from './question-bank-db-service'
import {
  QUESTION_TYPE_OPTIONS,
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
  extractArkText,
  extractFirstJsonObject,
  getPayloadSourceMeta,
  loadTextbookJson,
  normalizeQuestionItem,
  normalizeQuestionType,
  normalizeTitle,
  parseModelJsonObject,
  payloadExpectsAnswer,
  requestArkRawWithRetry,
  saveTextbookJson,
  upsertQuestionsById,
} from './question-bank-service'
import type {
  ChapterItem,
  QuestionGroup,
  QuestionGroupChild,
  QuestionItem,
  QuestionLeaf,
  TextbookJsonPayload,
} from './types'

type ExamSectionContext = {
  majorTitle: string
  minorTitle: string
  chapterId: string
  structureLabel: string
}

type ExtractSectionResponse = {
  jsonFilePath: string
  examTitle: string
  examType: string
  hasAnswer: boolean
  questionType: string
  questionTypeLabel: string
  currentMajorTitle: string
  currentMinorTitle: string
  currentStructureChapterId: string
  chaptersCount: number
  questionsCount: number
  question: {
    upsertedCount: number
    reason: string
    pending: false
    continueQuestionKey: null
  }
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
  for (const char of token) {
    if (map[char] !== undefined) {
      current = map[char]
      continue
    }
    if (char === '十') {
      total += (current || 1) * 10
      current = 0
      continue
    }
    if (char === '百') {
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
    return Math.max(max, match?.[1] ? Number(match[1]) : 0)
  }, 0)
  const parsedMajorNo = extractExamMajorNo(title)
  const majorNo = parsedMajorNo > 0 ? parsedMajorNo : maxIdNum + 1

  const created: ChapterItem = {
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
    return Math.max(max, match?.[1] ? Number(match[1]) : 0)
  }, 0)
  const parsedMinorNo = extractExamMinorNo(title, parentMajorNo)
  const minorNo = parsedMinorNo > 0 ? parsedMinorNo : maxMinorNo + 1

  const created: ChapterItem = {
    chapterId: `ch_${parentMajorNo}_${minorNo}`,
    parentId: parentChapterId,
    title,
    orderNo: parsedMinorNo > 0 ? parsedMinorNo : maxOrder + 1,
  }
  payload.chapters.push(created)
  return created
}

function buildExamStructureLabel(majorTitle: string, minorTitle: string) {
  return [normalizeTitle(majorTitle), normalizeTitle(minorTitle)].filter(Boolean).join(' / ') || '未命名结构'
}

function ensureExamStructureContext(payload: TextbookJsonPayload, majorTitleInput: string, minorTitleInput = '') {
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
      structureLabel: buildExamStructureLabel(majorTitle, ''),
    } as ExamSectionContext
  }
  const minor = ensureExamMinorChapter(payload, major.chapterId, minorTitle)
  return {
    majorTitle,
    minorTitle,
    chapterId: minor.chapterId,
    structureLabel: buildExamStructureLabel(majorTitle, minorTitle),
  } as ExamSectionContext
}

function getQuestionTypeMeta(questionTypeInput: string) {
  const questionType = normalizeQuestionType(questionTypeInput)
  const meta = QUESTION_TYPE_OPTIONS.find((item) => item.value === questionType)
  if (!meta) {
    throw new Error(`questionType is unsupported: ${questionTypeInput}`)
  }
  return meta
}

function ensureExamPayload(jsonFilePath: string, payload: TextbookJsonPayload) {
  const sourceMeta = getPayloadSourceMeta(payload)
  if (sourceMeta.documentType !== 'exam') {
    throw new Error(`JSON is not an exam payload: ${jsonFilePath}`)
  }
  return sourceMeta
}

function chapterSuffixFromChapterId(chapterId: string) {
  const match = String(chapterId || '').trim().match(/^ch_(\d+)(?:_(\d+))?$/)
  if (!match?.[1]) {
    return '0_0'
  }
  return `${match[1]}_${match[2] || '0'}`
}

function extractTopQuestionNoFromQuestionId(questionId: string) {
  const match = String(questionId || '').trim().match(/^q_(\d+)_(\d+)_(\d+)/)
  if (!match?.[3]) {
    return 0
  }
  return Number(match[3]) || 0
}

function getNextQuestionNo(payload: TextbookJsonPayload, chapterId: string) {
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  const maxNo = questions.reduce<number>((max, item) => {
    if (!item || typeof item !== 'object') {
      return max
    }
    const row = item as Record<string, unknown>
    const questionChapterId = typeof row.chapterId === 'string' ? row.chapterId.trim() : ''
    if (questionChapterId !== chapterId) {
      return max
    }
    const questionId = typeof row.questionId === 'string' ? row.questionId.trim() : ''
    return Math.max(max, extractTopQuestionNoFromQuestionId(questionId))
  }, 0)
  return maxNo + 1
}

function buildExamQuestionTitle(context: ExamSectionContext, mainNo: number) {
  return `${context.structureLabel} 第${mainNo}题`.trim()
}

function buildExamChildTitle(parentTitle: string, childNo: number) {
  return `${parentTitle} 第${childNo}小题`.trim()
}

function applyFixedQuestionType(question: QuestionItem, questionType: string) {
  if (question.nodeType === 'GROUP') {
    return {
      ...question,
      questionType,
      children: question.children.map((child) => ({
        ...child,
        questionType,
      })),
    } as QuestionGroup
  }
  return {
    ...question,
    questionType,
  } as QuestionLeaf
}

function reassignQuestionToExamSection(
  question: QuestionItem,
  context: ExamSectionContext,
  questionType: string,
  mainNo: number,
) {
  const suffix = chapterSuffixFromChapterId(context.chapterId)
  const title = buildExamQuestionTitle(context, mainNo)
  if (question.nodeType === 'GROUP') {
    return {
      ...question,
      questionId: `q_${suffix}_${mainNo}`,
      chapterId: context.chapterId,
      questionType,
      title,
      children: question.children.map((child, index) => {
        const childNo = index + 1
        return {
          ...child,
          questionId: `q_${suffix}_${mainNo}_${childNo}`,
          title: buildExamChildTitle(title, childNo),
          orderNo: childNo,
          chapterId: context.chapterId,
          questionType,
        } as QuestionGroupChild
      }),
    } as QuestionGroup
  }
  return {
    ...question,
    questionId: `q_${suffix}_${mainNo}`,
    chapterId: context.chapterId,
    questionType,
    title,
  } as QuestionLeaf
}

function normalizeQuestionsForExamSection(params: {
  payload: TextbookJsonPayload
  rawQuestions: unknown[]
  context: ExamSectionContext
  questionType: string
  expectAnswer: boolean
  startQuestionNo?: number
}) {
  const { payload, rawQuestions, context, questionType, expectAnswer, startQuestionNo } = params
  const normalized: QuestionItem[] = []
  let nextQuestionNo =
    Number.isFinite(Number(startQuestionNo)) && Number(startQuestionNo) > 0
      ? Number(startQuestionNo)
      : getNextQuestionNo(payload, context.chapterId)

  for (const rawQuestion of rawQuestions) {
    const item = normalizeQuestionItem(rawQuestion, context.chapterId, context.structureLabel, {
      expectAnswer,
    })
    if (!item) {
      continue
    }
    const fixed = applyFixedQuestionType(item, questionType)
    normalized.push(reassignQuestionToExamSection(fixed, context, questionType, nextQuestionNo))
    nextQuestionNo += 1
  }

  return normalized
}

function cloneQuestionItems(items: QuestionItem[]) {
  return JSON.parse(JSON.stringify(items)) as QuestionItem[]
}

function normalizeScoreValue(value: unknown, fallback = 10) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback
  }
  return Math.round(numeric * 100) / 100
}

function rescaleRubric(rubric: Array<{ rubricItemKey: string; maxScore: number; criteria: string }>, totalScore: number) {
  const targetScore = normalizeScoreValue(totalScore, 10)
  const source = Array.isArray(rubric) && rubric.length
    ? rubric.map((item, index) => ({
        rubricItemKey: String(item?.rubricItemKey || `key_${index + 1}`).trim() || `key_${index + 1}`,
        maxScore: normalizeScoreValue(item?.maxScore, 0),
        criteria: String(item?.criteria || '').trim() || `评分点 ${index + 1}`,
      }))
    : [
        { rubricItemKey: 'key_1', maxScore: targetScore / 2, criteria: '关键步骤正确' },
        { rubricItemKey: 'key_2', maxScore: targetScore / 2, criteria: '结论正确' },
      ]
  const sourceTotal = source.reduce((sum, item) => sum + item.maxScore, 0)
  if (sourceTotal <= 0) {
    const even = Math.round((targetScore / source.length) * 100) / 100
    return source.map((item, index) => ({
      ...item,
      maxScore: index === source.length - 1 ? Math.round((targetScore - even * (source.length - 1)) * 100) / 100 : even,
    }))
  }

  const scaled = source.map((item) => ({
    ...item,
    maxScore: Math.round((item.maxScore / sourceTotal) * targetScore * 100) / 100,
  }))
  const scaledTotal = scaled.reduce((sum, item) => sum + item.maxScore, 0)
  const delta = Math.round((targetScore - scaledTotal) * 100) / 100
  scaled[scaled.length - 1] = {
    ...scaled[scaled.length - 1],
    maxScore: Math.round((scaled[scaled.length - 1].maxScore + delta) * 100) / 100,
  }
  return scaled
}

function applyEditableScoresFromRaw(question: QuestionItem, rawQuestion: unknown) {
  const source = rawQuestion && typeof rawQuestion === 'object' ? (rawQuestion as Record<string, unknown>) : {}
  if (question.nodeType === 'GROUP') {
    const rawChildren = Array.isArray(source.children) ? source.children : []
    return {
      ...question,
      children: question.children.map((child, index) => {
        const rawChild =
          rawChildren[index] && typeof rawChildren[index] === 'object'
            ? (rawChildren[index] as Record<string, unknown>)
            : {}
        const defaultScore = normalizeScoreValue(rawChild.defaultScore, child.defaultScore || 10)
        return {
          ...child,
          defaultScore,
          rubric: rescaleRubric(Array.isArray(child.rubric) ? child.rubric : [], defaultScore),
        } as QuestionGroupChild
      }),
    } as QuestionGroup
  }

  const defaultScore = normalizeScoreValue(source.defaultScore, question.defaultScore || 10)
  return {
    ...question,
    defaultScore,
    rubric: rescaleRubric(Array.isArray(question.rubric) ? question.rubric : [], defaultScore),
  } as QuestionLeaf
}

function normalizePreviewQuestions(params: {
  rawQuestions: unknown[]
  context: ExamSectionContext
  questionType: string
  expectAnswer: boolean
}) {
  const previewPayload: TextbookJsonPayload = {
    version: 'v1.1',
    courseId: 'preview',
    documentType: 'exam',
    exam: {
      examId: 'preview',
      title: 'preview',
      subject: '',
      examType: 'midterm',
      hasAnswer: params.expectAnswer,
    },
    chapters: [],
    questions: [],
  }
  return normalizeQuestionsForExamSection({
    payload: previewPayload,
    rawQuestions: params.rawQuestions,
    context: params.context,
    questionType: params.questionType,
    expectAnswer: params.expectAnswer,
    startQuestionNo: 1,
  })
}

async function requestExamSectionJsonObject(params: {
  instruction: string
  imageDataUrls: string[]
}) {
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
          { type: 'input_text', text: params.instruction },
          ...params.imageDataUrls.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
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

async function extractExamSectionQuestionsByDoubao(params: {
  examTitle: string
  examType: string
  hasAnswer: boolean
  context: ExamSectionContext
  questionType: string
  questionTypeLabel: string
  imageDataUrls: string[]
}) {
  const instruction = [
    '你是试卷分段提取助手。',
    '这次不是自动识别整份试卷，而是只提取前端已经指定好的一个部分。',
    '你不需要做结构切换判断，不需要做跨页预读，不需要输出 needNextPage / continueQuestionKey / structure。',
    '上下文:',
    `- 试卷标题: ${params.examTitle}`,
    `- 考试类型: ${params.examType}`,
    `- 是否有答案: ${params.hasAnswer ? 'true' : 'false'}`,
    `- 目标大结构标题: ${params.context.majorTitle}`,
    `- 目标二级结构标题: ${params.context.minorTitle || 'null'}`,
    `- 目标结构 chapterId: ${params.context.chapterId}`,
    `- 目标题型: ${params.questionType}（${params.questionTypeLabel}）`,
    '提取要求:',
    '1) 只提取属于当前指定结构和指定题型的完整题目。',
    '2) 如果图片里同时出现其他大题区、其他小结构、其他题型，全部忽略。',
    '3) 如果最后一道题在图中被截断或只露出一部分，不要输出这道题。',
    '4) 本次 questionsToUpsert 可以为空；为空时请在 reason 里明确说明没有找到完整可提取的目标题目。',
    `5) 本次所有 top-level questionType 与 GROUP.children.questionType 都固定写成 ${params.questionType}。`,
    `6) 所有题目的 chapterId 都固定写成 ${params.context.chapterId}。`,
    params.hasAnswer
      ? '7) 如果题干可见但答案在图片里没有完整出现，standardAnswer 保持空字符串，不得猜测补写。'
      : '7) 本文档无答案，所有 standardAnswer 字段必须保留，但统一返回空字符串和空 media。',
    ...buildSharedQuestionContentRuleLines(8),
    ...buildSharedQuestionStructureInstructionLines(params.hasAnswer),
    '严格输出 JSON（不要 markdown，不要解释）:',
    '{',
    '  "questionsToUpsert": [ ...question objects... ],',
    '  "reason": "string"',
    '}',
  ].join('\n')

  const { output, rawText } = await requestExamSectionJsonObject({
    instruction,
    imageDataUrls: params.imageDataUrls,
  })
  return {
    questionsToUpsert: Array.isArray(output.questionsToUpsert) ? output.questionsToUpsert : [],
    reason: typeof output.reason === 'string' ? output.reason : '',
    rawText,
  }
}

function buildExamSectionPreviewResponse(params: {
  jsonFilePath: string
  sourceMeta: ReturnType<typeof getPayloadSourceMeta>
  context: ExamSectionContext
  questionType: string
  questionTypeLabel: string
  rawQuestions: unknown[]
  reason: string
}) {
  const previewQuestions = cloneQuestionItems(
    normalizePreviewQuestions({
      rawQuestions: params.rawQuestions,
      context: params.context,
      questionType: params.questionType,
      expectAnswer: params.sourceMeta.hasAnswer !== false,
    }),
  )

  return {
    jsonFilePath: params.jsonFilePath,
    examTitle: params.sourceMeta.title,
    examType: params.sourceMeta.examType || 'midterm',
    hasAnswer: params.sourceMeta.hasAnswer !== false,
    questionType: params.questionType,
    questionTypeLabel: params.questionTypeLabel,
    currentMajorTitle: params.context.majorTitle,
    currentMinorTitle: params.context.minorTitle,
    currentStructureChapterId: params.context.chapterId,
    questionsToStage: previewQuestions,
    question: {
      upsertedCount: previewQuestions.length,
      reason: params.reason || (previewQuestions.length ? `已暂存 ${previewQuestions.length} 道题` : '本次没有提取到可暂存题目'),
      pending: false as const,
      continueQuestionKey: null,
    },
  }
}

export async function previewExamSectionFromImages(params: {
  jsonFilePath: string
  majorTitle: string
  minorTitle?: string
  questionType: string
  imageDataUrls: string[]
}) {
  if (!Array.isArray(params.imageDataUrls) || !params.imageDataUrls.length) {
    throw new Error('imageDataUrls is required')
  }

  const payload = await loadTextbookJson(params.jsonFilePath)
  const sourceMeta = ensureExamPayload(params.jsonFilePath, payload)
  const previewPayload: TextbookJsonPayload = {
    ...payload,
    chapters: Array.isArray(payload.chapters) ? [...payload.chapters] : [],
    questions: [],
  }
  const context = ensureExamStructureContext(previewPayload, params.majorTitle, params.minorTitle || '')
  const questionTypeMeta = getQuestionTypeMeta(params.questionType)
  const extracted = await extractExamSectionQuestionsByDoubao({
    examTitle: sourceMeta.title,
    examType: sourceMeta.examType || 'midterm',
    hasAnswer: sourceMeta.hasAnswer !== false,
    context,
    questionType: questionTypeMeta.value,
    questionTypeLabel: questionTypeMeta.label,
    imageDataUrls: params.imageDataUrls,
  })

  return buildExamSectionPreviewResponse({
    jsonFilePath: params.jsonFilePath,
    sourceMeta,
    context,
    questionType: questionTypeMeta.value,
    questionTypeLabel: questionTypeMeta.label,
    rawQuestions: extracted.questionsToUpsert,
    reason: extracted.reason || extracted.rawText,
  })
}

export async function previewExamSectionFromQuestionBank(params: {
  jsonFilePath: string
  majorTitle: string
  minorTitle?: string
  questionType: string
  recordIds: string[]
}) {
  const normalizedIds = [...new Set((Array.isArray(params.recordIds) ? params.recordIds : []).map((item) => String(item || '').trim()).filter(Boolean))]
  if (!normalizedIds.length) {
    throw new Error('recordIds is required')
  }

  const payload = await loadTextbookJson(params.jsonFilePath)
  const sourceMeta = ensureExamPayload(params.jsonFilePath, payload)
  const previewPayload: TextbookJsonPayload = {
    ...payload,
    chapters: Array.isArray(payload.chapters) ? [...payload.chapters] : [],
    questions: [],
  }
  const context = ensureExamStructureContext(previewPayload, params.majorTitle, params.minorTitle || '')
  const questionTypeMeta = getQuestionTypeMeta(params.questionType)
  const sourceRows = await loadQuestionBankTopLevelQuestionsByIds(normalizedIds)
  if (sourceRows.length !== normalizedIds.length) {
    const foundIds = new Set(sourceRows.map((item) => item.recordId))
    const missing = normalizedIds.filter((item) => !foundIds.has(item))
    throw new Error(`部分题库题目不存在或已失效: ${missing.join(', ')}`)
  }

  return buildExamSectionPreviewResponse({
    jsonFilePath: params.jsonFilePath,
    sourceMeta,
    context,
    questionType: questionTypeMeta.value,
    questionTypeLabel: questionTypeMeta.label,
    rawQuestions: sourceRows.map((item) => item.rawPayloadJson),
    reason: `已从题库选入 ${sourceRows.length} 道${questionTypeMeta.label}`,
  })
}

export async function finalizeExamSections(params: {
  jsonFilePath: string
  sections: Array<{
    majorTitle: string
    minorTitle?: string
    questionType: string
    questions: unknown[]
  }>
}) {
  const sections = Array.isArray(params.sections) ? params.sections : []
  if (!sections.length) {
    throw new Error('sections is required')
  }

  const basePayload = await loadTextbookJson(params.jsonFilePath)
  const sourceMeta = ensureExamPayload(params.jsonFilePath, basePayload)
  const finalPayload: TextbookJsonPayload = {
    ...basePayload,
    chapters: [],
    questions: [],
  }

  for (const section of sections) {
    const majorTitle = normalizeTitle(section?.majorTitle || '')
    const minorTitle = normalizeTitle(section?.minorTitle || '')
    if (!majorTitle) {
      throw new Error('section.majorTitle is required')
    }
    const questionTypeMeta = getQuestionTypeMeta(String(section?.questionType || '').trim())
    const context = ensureExamStructureContext(finalPayload, majorTitle, minorTitle)
    const rawQuestions = Array.isArray(section?.questions) ? section.questions : []
    const normalized = normalizeQuestionsForExamSection({
      payload: finalPayload,
      rawQuestions,
      context,
      questionType: questionTypeMeta.value,
      expectAnswer: sourceMeta.hasAnswer !== false,
    }).map((item, index) => applyEditableScoresFromRaw(item, rawQuestions[index]))
    upsertQuestionsById(finalPayload, normalized)
  }

  await saveTextbookJson(params.jsonFilePath, finalPayload)
  return {
    jsonFilePath: params.jsonFilePath,
    examTitle: sourceMeta.title,
    examType: sourceMeta.examType || 'midterm',
    hasAnswer: sourceMeta.hasAnswer !== false,
    chaptersCount: Array.isArray(finalPayload.chapters) ? finalPayload.chapters.length : 0,
    questionsCount: Array.isArray(finalPayload.questions) ? finalPayload.questions.length : 0,
    sectionCount: sections.length,
  } as ExtractSectionResponse & { sectionCount: number }
}
