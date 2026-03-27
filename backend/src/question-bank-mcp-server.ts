import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ARK_MODEL } from './config'
import { extractArkText, extractFirstJsonObject, parseModelJsonObject, requestArkRawWithRetry } from './question-bank-service'
import {
  getQuestionBankDatabaseSummary,
  getQuestionBankDbSchemaName,
  getQuestionBankPoolInstance,
} from './question-bank-db-service'

function quoteIdentifier(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function tableName(name: string) {
  return `${quoteIdentifier(getQuestionBankDbSchemaName())}.${quoteIdentifier(name)}`
}

function buildToolResult(title: string, payload: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${title}\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    structuredContent: payload,
  }
}

function normalizeKeyword(value: string | undefined) {
  const keyword = String(value || '').trim()
  return keyword ? `%${keyword}%` : ''
}

function normalizeOptionalText(value: string | undefined) {
  const text = String(value || '').trim()
  return text || null
}

function normalizeDocumentType(value: string | undefined) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'textbook' || normalized === 'exam') {
    return normalized
  }
  return null
}

function normalizeOptionalNumber(value: string | number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.trunc(numeric)))
}

function toNumber(value: string | number | null | undefined) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function toJsonObject(value: unknown) {
  return value && typeof value === 'object' ? value : null
}

function toCompactJsonText(value: unknown, maxLength = 500) {
  if (value === null || value === undefined) {
    return ''
  }
  const raw =
    typeof value === 'string'
      ? value
      : (() => {
          try {
            return JSON.stringify(value)
          } catch {
            return String(value)
          }
        })()

  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function compactText(value: string | null | undefined, maxLength = 180) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = String(value || '').trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function parseChineseIntegerToken(rawToken: string) {
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
    if (ch === '千') {
      total += (current || 1) * 1000
      current = 0
      continue
    }
  }

  return total + current
}

function toReferenceNumber(rawValue: string | undefined) {
  const numeric = parseChineseIntegerToken(String(rawValue || '').trim())
  return numeric > 0 ? numeric : null
}

function normalizeQuestionReferenceText(value: string) {
  return String(value || '')
    .replace(/[，、；;：:！？?!（）()\[\]【】"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type ParsedAssignmentQuestionReference = {
  rawReference: string
  normalizedReference: string
  explicitQuestionCode: string | null
  sectionTitle: string | null
  chapterNo: number | null
  sectionNo: number | null
  mainQuestionNo: number | null
  subQuestionNo: number | null
  questionCodeCandidates: string[]
  titleCandidates: string[]
  isSpecificReference: boolean
}

function parseAssignmentQuestionReference(reference: string): ParsedAssignmentQuestionReference {
  const rawReference = String(reference || '').trim()
  const normalizedReference = normalizeQuestionReferenceText(rawReference)
  const compactReference = normalizedReference.replace(/\s+/g, '')

  const explicitQuestionCode =
    compactReference.match(/\bq_\d+(?:_\d+){2,3}\b/i)?.[0]?.toLowerCase() || null

  let chapterNo: number | null = null
  let sectionNo: number | null = null
  let mainQuestionNo: number | null = null
  let subQuestionNo: number | null = null

  if (explicitQuestionCode) {
    const parts = explicitQuestionCode
      .split('_')
      .slice(1)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)

    chapterNo = parts[0] || null
    sectionNo = parts[1] || null
    mainQuestionNo = parts[2] || null
    subQuestionNo = parts[3] || null
  }

  const sectionMatch =
    normalizedReference.match(/习题\s*(\d+)\s*[._．。]\s*(\d+)/) ||
    normalizedReference.match(/(?:^|[^0-9])(\d+)\s*[._．。]\s*(\d+)(?=[^\d]|$)/)
  if (sectionMatch?.[1] && sectionMatch?.[2]) {
    chapterNo = chapterNo || Number(sectionMatch[1])
    sectionNo = sectionNo || Number(sectionMatch[2])
  }

  const mainQuestionMatch = normalizedReference.match(/第\s*([零一二两三四五六七八九十百千\d]+)\s*(?:题|问)/)
  const subQuestionMatch = normalizedReference.match(/第\s*([零一二两三四五六七八九十百千\d]+)\s*(?:小题|小问)/)
  mainQuestionNo = mainQuestionNo || toReferenceNumber(mainQuestionMatch?.[1])
  subQuestionNo = subQuestionNo || toReferenceNumber(subQuestionMatch?.[1])

  const sectionTitle = chapterNo && sectionNo ? `习题${chapterNo}.${sectionNo}` : null
  const titleCandidates = sectionTitle && mainQuestionNo
    ? [
        `${sectionTitle} 第${mainQuestionNo}题${subQuestionNo ? ` 第${subQuestionNo}小题` : ''}`.trim(),
      ]
    : []

  const questionCodeCandidates = dedupeStrings(
    [
      explicitQuestionCode || '',
      chapterNo && sectionNo && mainQuestionNo
        ? `q_${chapterNo}_${sectionNo}_${mainQuestionNo}${subQuestionNo ? `_${subQuestionNo}` : ''}`
        : '',
    ].filter(Boolean),
  )

  return {
    rawReference,
    normalizedReference,
    explicitQuestionCode,
    sectionTitle,
    chapterNo,
    sectionNo,
    mainQuestionNo,
    subQuestionNo,
    questionCodeCandidates,
    titleCandidates,
    isSpecificReference: Boolean(explicitQuestionCode || (sectionTitle && mainQuestionNo)),
  }
}

const QUESTION_SEARCH_STOP_PHRASES = [
  '中等难度',
  '较难',
  '偏难',
  '简单',
  '容易',
  '困难',
  '难度',
  '帮我',
  '给我',
  '来一道',
  '来一题',
  '来一个',
  '来',
  '找一道',
  '找一题',
  '找题',
  '找',
  '推荐',
  '筛选',
  '告诉我',
  '请',
  '一道',
  '一题',
  '一个',
  '题目',
  '习题',
  '题型',
  '相关',
  '里面',
  '里面的',
  '中的',
  '关于',
  '有关',
  '属于',
  '是不是',
  '是否',
  '可以',
]

const QUESTION_SEARCH_ACTION_WORDS = ['计算', '求解', '求', '解', '判断', '证明', '化简', '完成', '利用', '应用', '使用']

const QUESTION_SEARCH_SEGMENT_SPLITTER =
  /(?:\s+|通过|利用|应用|使用|用于|用来|用|来|把|将|帮我|给我|告诉我|请|推荐|筛选|找一道|找一题|找题|找|一道|一题|一个|相关|有关|关于|是不是|是否|可以|能否|如何|怎么|为什么|里面的|里面|里的|中的|以及|并且|或者|或|的|地|得)+/g

const QUESTION_SEARCH_DOMAIN_PATTERNS = [
  /不定积分/g,
  /定积分/g,
  /积分和/g,
  /曲边梯形/g,
  /旋转曲面/g,
  /旋转体/g,
  /平面图形/g,
  /空间图形/g,
  /公共部分/g,
  /阴影部分/g,
  /截面面积/g,
  /曲面积/g,
  /平面面积/g,
  /空间面积/g,
  /表面积/g,
  /面积/g,
  /体积/g,
  /极限/g,
  /证明/g,
  /可积/g,
]

const QUESTION_SEARCH_STOP_TERMS = new Set(
  dedupeStrings([
    ...QUESTION_SEARCH_STOP_PHRASES,
    ...QUESTION_SEARCH_ACTION_WORDS,
    '题',
  ]),
)

function normalizeQuestionSearchText(value: string) {
  return String(value || '')
    .replace(/[，。,.、；;：:！？?!（）()\[\]【】"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeQuestionSearchFragment(value: string) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/^[的地得]+/, '')
    .replace(/[的地得]+$/, '')
    .trim()
}

function isUsefulQuestionSearchFragment(value: string) {
  const normalized = normalizeQuestionSearchFragment(value)
  if (!normalized || normalized.length < 2 || normalized.length > 24) {
    return false
  }
  if (QUESTION_SEARCH_STOP_TERMS.has(normalized)) {
    return false
  }
  if (!/[A-Za-z0-9\u4E00-\u9FFF]/.test(normalized)) {
    return false
  }
  if (/^[的地得]+$/.test(normalized)) {
    return false
  }
  return true
}

function extractQuestionSearchFragments(value: string) {
  const normalized = normalizeQuestionSearchText(value)
  if (!normalized) {
    return []
  }

  const fragments: string[] = []
  const compact = normalized.replace(/\s+/g, '')

  for (const pattern of QUESTION_SEARCH_DOMAIN_PATTERNS) {
    const matches = compact.match(pattern)
    if (matches?.length) {
      fragments.push(...matches)
    }
  }

  const coarseSegments = normalized
    .replace(QUESTION_SEARCH_SEGMENT_SPLITTER, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (coarseSegments) {
    fragments.push(...coarseSegments.split(' '))
  }

  const compactSegments = coarseSegments
    ? coarseSegments
        .split(/\s+/)
        .map((segment) => segment.replace(/\s+/g, '').trim())
        .filter(Boolean)
    : []

  for (const segment of compactSegments) {
    fragments.push(segment)
  }

  return dedupeStrings(
    fragments.map(normalizeQuestionSearchFragment).filter(isUsefulQuestionSearchFragment),
  ).slice(0, 12)
}

function extractQuestionDomainKeywords(value: string) {
  const normalized = normalizeQuestionSearchText(value)
  if (!normalized) {
    return []
  }

  const compact = normalized.replace(/\s+/g, '')
  const fragments: string[] = []
  for (const pattern of QUESTION_SEARCH_DOMAIN_PATTERNS) {
    const matches = compact.match(pattern)
    if (matches?.length) {
      fragments.push(...matches)
    }
  }

  return dedupeStrings(fragments.map(normalizeQuestionSearchFragment).filter(isUsefulQuestionSearchFragment))
}

function collectQuestionTextQueries(params: { query?: string; extraQueries?: string[] }) {
  return dedupeStrings([params.query || '', ...(params.extraQueries || [])]).filter(Boolean)
}

function deriveRecallKeywords(requirement: string, query?: string) {
  const rawTexts = dedupeStrings([query || '', requirement || ''])
  const variants = new Set<string>()

  for (const rawText of rawTexts) {
    const normalized = normalizeQuestionSearchText(rawText)

    if (!normalized) {
      continue
    }

    variants.add(normalized)

    let stripped = normalized
    for (const phrase of QUESTION_SEARCH_STOP_PHRASES) {
      stripped = stripped.replaceAll(phrase, ' ')
    }
    stripped = normalizeQuestionSearchText(stripped)
    if (stripped) {
      variants.add(stripped)
      for (const fragment of extractQuestionDomainKeywords(stripped)) {
        variants.add(fragment)
      }
    }

    let nounLike = stripped
    for (const verb of QUESTION_SEARCH_ACTION_WORDS) {
      nounLike = nounLike.replaceAll(verb, ' ')
    }
    nounLike = normalizeQuestionSearchText(nounLike)
    if (nounLike) {
      variants.add(nounLike)
      for (const fragment of extractQuestionSearchFragments(nounLike)) {
        variants.add(fragment)
      }
    }
  }

  return dedupeStrings([...variants].map(normalizeQuestionSearchFragment).filter(isUsefulQuestionSearchFragment)).slice(0, 12)
}

function buildQuestionKeywordCondition(keywordParamIndex: number) {
  return [
    `q.title ILIKE $${keywordParamIndex}`,
    `q.description ILIKE $${keywordParamIndex}`,
    `q.question_code ILIKE $${keywordParamIndex}`,
    `COALESCE(c.title, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(pc.title, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(gc.title, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.stem::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.prompt::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.standard_answer::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.rubric::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.question_schema::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.raw_payload_json::text, '') ILIKE $${keywordParamIndex}`,
  ].join(' OR ')
}

function buildQuestionKeywordScoreExpression(keywordParamIndex: number, specificityWeight: number) {
  return [
    'GREATEST(',
    `CASE WHEN q.title ILIKE $${keywordParamIndex} THEN ${12 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN q.description ILIKE $${keywordParamIndex} THEN ${10 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN q.question_code ILIKE $${keywordParamIndex} THEN ${6 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(c.title, '') ILIKE $${keywordParamIndex} THEN ${7 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(pc.title, '') ILIKE $${keywordParamIndex} THEN ${8 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(gc.title, '') ILIKE $${keywordParamIndex} THEN ${8 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(q.stem::text, '') ILIKE $${keywordParamIndex} THEN ${9 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(q.prompt::text, '') ILIKE $${keywordParamIndex} THEN ${11 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(q.standard_answer::text, '') ILIKE $${keywordParamIndex} THEN ${4 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(q.rubric::text, '') ILIKE $${keywordParamIndex} THEN ${2 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(q.question_schema::text, '') ILIKE $${keywordParamIndex} THEN ${2 * specificityWeight} ELSE 0 END,`,
    `CASE WHEN COALESCE(q.raw_payload_json::text, '') ILIKE $${keywordParamIndex} THEN ${2 * specificityWeight} ELSE 0 END`,
    ')',
  ].join(' ')
}

function getQuestionQuerySpecificityWeight(value: string) {
  const length = String(value || '').replace(/\s+/g, '').trim().length
  if (length >= 6) {
    return 4
  }
  if (length >= 4) {
    return 3
  }
  if (length >= 3) {
    return 2
  }
  return 1
}

function buildQuestionSearchConditions(params: {
  query?: string
  extraQueries?: string[]
  textbookId?: string
  documentType?: string
  courseId?: string
  chapterId?: string
  questionCode?: string
  nodeType?: 'LEAF' | 'GROUP'
  questionType?: string
  status?: string
}) {
  const conditions: string[] = []
  const values: string[] = []

  const textQueries = collectQuestionTextQueries(params)
  if (textQueries.length) {
    const keywordConditions: string[] = []
    for (const textQuery of textQueries) {
      const keyword = normalizeKeyword(textQuery)
      if (!keyword) {
        continue
      }
      values.push(keyword)
      keywordConditions.push(`(${buildQuestionKeywordCondition(values.length)})`)
    }
    if (keywordConditions.length) {
      conditions.push(`(${keywordConditions.join(' OR ')})`)
    }
  }

  const textbookId = normalizeOptionalText(params.textbookId)
  if (textbookId) {
    values.push(textbookId)
    conditions.push(`t.external_id = $${values.length}`)
  }

  const documentType = normalizeDocumentType(params.documentType)
  if (documentType) {
    values.push(documentType)
    conditions.push(`t.document_type = $${values.length}`)
  }

  const courseId = normalizeOptionalText(params.courseId)
  if (courseId) {
    values.push(courseId)
    conditions.push(`q.course_id = $${values.length}`)
  }

  const chapterId = normalizeOptionalText(params.chapterId)
  if (chapterId) {
    values.push(chapterId)
    conditions.push(`c.external_id = $${values.length}`)
  }

  const questionCode = normalizeOptionalText(params.questionCode)
  if (questionCode) {
    values.push(questionCode)
    conditions.push(`q.question_code = $${values.length}`)
  }

  if (params.nodeType) {
    values.push(params.nodeType)
    conditions.push(`q.node_type = $${values.length}`)
  }

  const questionType = normalizeOptionalText(params.questionType)
  if (questionType) {
    values.push(questionType)
    conditions.push(`q.question_type = $${values.length}`)
  }

  const status = normalizeOptionalText(params.status)
  if (status) {
    values.push(status)
    conditions.push(`q.status = $${values.length}`)
  }

  return { conditions, values }
}

type QuestionCandidateRow = {
  questionCode: string
  nodeType: string
  questionType: string
  status: string
  orderNo: number | null
  title: string
  description: string
  chapterId: string | null
  chapterTitle: string | null
  textbookId: string
  textbookTitle: string
  documentType: string
  examType: string | null
  hasAnswer: boolean | null
  courseId: string
  defaultScore: string
  relevanceScore: number | null
  stem: unknown
  prompt: unknown
  standardAnswer: unknown
  rawPayloadJson: unknown
}

function buildQuestionContentPreview(candidate: Pick<QuestionCandidateRow, 'stem' | 'prompt'>, maxLength = 220) {
  return compactText(
    [toCompactJsonText(candidate.stem, maxLength), toCompactJsonText(candidate.prompt, maxLength)]
      .filter(Boolean)
      .join(' '),
    maxLength,
  )
}

async function loadQuestionCandidates(params: {
  query?: string
  extraQueries?: string[]
  textbookId?: string
  documentType?: string
  courseId?: string
  chapterId?: string
  questionCode?: string
  nodeType?: 'LEAF' | 'GROUP'
  questionType?: string
  status?: string
  limit: number
}) {
  const { conditions, values } = buildQuestionSearchConditions(params)

  if (!conditions.length) {
    throw new Error('至少提供一个筛选条件，例如 requirement、query、questionCode、chapterId、textbookId')
  }

  const textQueries = collectQuestionTextQueries(params)
  const scoreExpressions: string[] = []
  for (const textQuery of textQueries) {
    const keyword = normalizeKeyword(textQuery)
    if (!keyword) {
      continue
    }
    values.push(keyword)
    scoreExpressions.push(
      `(${buildQuestionKeywordScoreExpression(values.length, getQuestionQuerySpecificityWeight(textQuery))})`,
    )
  }

  const relevanceScoreSql = scoreExpressions.length ? scoreExpressions.join(' + ') : '0'
  values.push(String(params.limit))
  const result = await getQuestionBankPoolInstance().query<QuestionCandidateRow>(
    `
      SELECT
        (${relevanceScoreSql}) AS "relevanceScore",
        q.question_code AS "questionCode",
        q.node_type AS "nodeType",
        q.question_type AS "questionType",
        q.status,
        q.order_no AS "orderNo",
        q.title,
        q.description,
        c.external_id AS "chapterId",
        c.title AS "chapterTitle",
        t.external_id AS "textbookId",
        t.title AS "textbookTitle",
        t.document_type AS "documentType",
        t.exam_type AS "examType",
        t.has_answer AS "hasAnswer",
        q.course_id AS "courseId",
        q.default_score::text AS "defaultScore",
        q.stem,
        q.prompt,
        q.standard_answer AS "standardAnswer",
        q.raw_payload_json AS "rawPayloadJson"
      FROM ${tableName('assignment_questions')} q
      INNER JOIN ${tableName('textbooks')} t ON t.id = q.textbook_id
      LEFT JOIN ${tableName('chapters')} c ON c.id = q.chapter_id
      LEFT JOIN ${tableName('chapters')} pc ON pc.id = c.parent_id
      LEFT JOIN ${tableName('chapters')} gc ON gc.id = pc.parent_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY "relevanceScore" DESC, t.updated_at DESC, COALESCE(c.order_no, 0) ASC, q.order_no ASC NULLS LAST, q.question_code ASC
      LIMIT $${values.length}
    `,
    values,
  )

  return result.rows
}

function serializeCandidateForModel(candidate: QuestionCandidateRow) {
  return {
    questionCode: candidate.questionCode,
    nodeType: candidate.nodeType,
    questionType: candidate.questionType,
    textbookId: candidate.textbookId,
    textbookTitle: candidate.textbookTitle,
    documentType: candidate.documentType,
    examType: candidate.examType,
    hasAnswer: candidate.hasAnswer,
    chapterId: candidate.chapterId,
    chapterTitle: candidate.chapterTitle,
    defaultScore: toNumber(candidate.defaultScore),
    retrievalScore: toNumber(candidate.relevanceScore),
    title: compactText(candidate.title, 300),
    description: compactText(candidate.description, 400),
    contentPreview: buildQuestionContentPreview(candidate, 260),
    stemText: toCompactJsonText(candidate.stem, 900),
    promptText: toCompactJsonText(candidate.prompt, 900),
    standardAnswerText: toCompactJsonText(candidate.standardAnswer, 500),
    rawPayloadText: toCompactJsonText(candidate.rawPayloadJson, 500),
  }
}

async function judgeQuestionCandidates(params: {
  requirement: string
  questionTypeHint?: string
  candidates: QuestionCandidateRow[]
  matchLimit: number
}) {
  const systemPrompt = [
    '你是题库候选题筛选器。',
    '你会收到用户要求和若干数据库候选题，请判断哪些题最符合要求。',
    '不要把 questionType 当成唯一依据，重点看题干、题目内容、章节标题、标准答案等文本。',
    '像“是不是计算行列式题”“难度是否中等”这类语义判断，必须由你综合题目内容自行判断。',
    '只能从候选题里选择，不能编造不存在的题号。',
    '如果没有明显匹配，也要如实返回空数组。',
    '只输出一个 JSON 对象，不要输出 markdown。',
    '输出格式：{"matches":[{"questionCode":"...","reason":"...","inferredDifficulty":"简单|中等|较难|未知","topicJudgement":"...","confidence":"high|medium|low"}]}',
  ].join('\n')

  const userPrompt = [
    `用户要求: ${params.requirement}`,
    `题型提示: ${params.questionTypeHint || '无'}`,
    `最多选择: ${params.matchLimit}`,
    '',
    '候选题列表：',
    JSON.stringify(params.candidates.map(serializeCandidateForModel), null, 2),
  ].join('\n')

  const raw = await requestArkRawWithRetry({
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
      },
    ],
    temperature: 0,
  } as Record<string, unknown>)

  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`候选题筛选输出不是 JSON: ${text.slice(0, 500)}`)
  }

  const payload = parseModelJsonObject(jsonText)
  const rawMatches = Array.isArray(payload.matches) ? payload.matches : []
  const candidateMap = new Map(params.candidates.map((candidate) => [candidate.questionCode, candidate]))

  return rawMatches
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const record = item as Record<string, unknown>
      const questionCode = String(record.questionCode || '').trim()
      const candidate = candidateMap.get(questionCode)
      if (!questionCode || !candidate) {
        return null
      }
      return {
        questionCode,
        reason: compactText(String(record.reason || ''), 240),
        inferredDifficulty: compactText(String(record.inferredDifficulty || '未知'), 12) || '未知',
        topicJudgement: compactText(String(record.topicJudgement || ''), 160),
        confidence: ['high', 'medium', 'low'].includes(String(record.confidence || '').trim())
          ? String(record.confidence).trim()
          : 'medium',
        questionType: candidate.questionType,
        textbookId: candidate.textbookId,
        textbookTitle: candidate.textbookTitle,
        documentType: candidate.documentType,
        examType: candidate.examType,
        hasAnswer: candidate.hasAnswer,
        chapterId: candidate.chapterId,
        chapterTitle: candidate.chapterTitle,
        title: candidate.title,
        description: candidate.description,
        defaultScore: toNumber(candidate.defaultScore),
        relevanceScore: toNumber(candidate.relevanceScore),
        contentPreview: buildQuestionContentPreview(candidate, 240),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, params.matchLimit)
}

export function createQuestionBankMcpServer() {
  const server = new McpServer({
    name: 'question-bank-mcp-server',
    version: '2.0.0',
  })

  server.registerTool(
    'get_schema_overview',
    {
      description: '读取题库 schema 的五张核心表说明，以及来源文档、结构节点、题目总量。',
      annotations: {
        title: '题库总览',
        readOnlyHint: true,
      },
    },
    async () => {
      const summary = await getQuestionBankDatabaseSummary()
      return buildToolResult('题库数据库总览', {
        schema: summary.schema,
        database: summary.database,
        counts: summary.counts,
        tables: {
          textbooks: [
            'id',
            'course_id',
            'document_type',
            'external_id',
            'title',
            'subject',
            'publisher',
            'version',
            'exam_type',
            'has_answer',
            'created_by',
          ],
          chapters: ['id', 'textbook_id', 'external_id', 'parent_id', 'title', 'order_no'],
          question_bank_textbook_schools: ['textbook_id', 'school_id', 'created_at'],
          assignment_questions: [
            'id',
            'textbook_id',
            'course_id',
            'chapter_id',
            'node_type',
            'parent_id',
            'question_code',
            'title',
            'description',
            'stem',
            'prompt',
            'standard_answer',
            'question_type',
            'default_score',
            'rubric',
            'question_schema',
            'grading_policy',
            'created_by',
            'status',
            'order_no',
          ],
          question_bank_papers: ['id', 'school_id', 'created_by', 'name', 'content', 'created_at', 'updated_at'],
        },
        textbooks: summary.textbooks.slice(0, 10),
      })
    },
  )

  server.registerTool(
    'list_textbooks',
    {
      description: '列出来源文档，兼容教材与试卷，支持按课程、来源类型或关键词过滤，并返回结构节点数和题目数。',
      annotations: {
        title: '来源列表',
        readOnlyHint: true,
      },
      inputSchema: {
        courseId: z.string().optional().describe('可选，按 course_id 过滤'),
        documentType: z.enum(['textbook', 'exam']).optional().describe('可选，按来源类型过滤'),
        keyword: z.string().optional().describe('可选，按来源标题、学科、出版社模糊匹配'),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      },
    },
    async ({ courseId, documentType, keyword, limit }) => {
      const conditions: string[] = []
      const values: string[] = []

      const normalizedCourseId = normalizeOptionalText(courseId)
      if (normalizedCourseId) {
        values.push(normalizedCourseId)
        conditions.push(`t.course_id = $${values.length}`)
      }

      const normalizedDocumentType = normalizeDocumentType(documentType)
      if (normalizedDocumentType) {
        values.push(normalizedDocumentType)
        conditions.push(`t.document_type = $${values.length}`)
      }

      const normalizedKeyword = normalizeKeyword(keyword)
      if (normalizedKeyword) {
        values.push(normalizedKeyword)
        conditions.push(
          `(t.title ILIKE $${values.length} OR t.subject ILIKE $${values.length} OR COALESCE(t.publisher, '') ILIKE $${values.length})`,
        )
      }

      values.push(String(limit))
      const result = await getQuestionBankPoolInstance().query<{
        textbookId: string
        courseId: string
        documentType: string
        title: string
        subject: string
        publisher: string | null
        version: string
        examType: string | null
        hasAnswer: boolean | null
        createdBy: string | null
        sourceFileName: string
        updatedAt: string
        chapters: string
        questionRows: string
      }>(
        `
          SELECT
            t.external_id AS "textbookId",
            t.course_id AS "courseId",
            t.document_type AS "documentType",
            t.title,
            t.subject,
            t.publisher,
            t.version,
            t.exam_type AS "examType",
            t.has_answer AS "hasAnswer",
            t.created_by AS "createdBy",
            t.source_file_name AS "sourceFileName",
            t.updated_at AS "updatedAt",
            COUNT(DISTINCT c.id)::text AS "chapters",
            COUNT(DISTINCT q.id)::text AS "questionRows"
          FROM ${tableName('textbooks')} t
          LEFT JOIN ${tableName('chapters')} c ON c.textbook_id = t.id
          LEFT JOIN ${tableName('assignment_questions')} q ON q.textbook_id = t.id
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          GROUP BY t.id
          ORDER BY t.updated_at DESC, t.title ASC
          LIMIT $${values.length}
        `,
        values,
      )

      return buildToolResult('来源文档列表', {
        schema: getQuestionBankDbSchemaName(),
        items: result.rows.map((row) => ({
          ...row,
          chapters: toNumber(row.chapters),
          questionRows: toNumber(row.questionRows),
        })),
      })
    },
  )

  server.registerTool(
    'get_textbook_detail',
    {
      description: '读取单个来源文档的详细信息，包括学校可见范围、结构节点统计和题目统计。',
      annotations: {
        title: '来源详情',
        readOnlyHint: true,
      },
      inputSchema: {
        textbookId: z.string().describe('来源 external_id。为兼容旧调用仍命名为 textbookId'),
        documentType: z.enum(['textbook', 'exam']).optional().describe('可选，按来源类型限定'),
        courseId: z.string().optional().describe('可选，辅助限定 course_id'),
      },
    },
    async ({ textbookId, documentType, courseId }) => {
      const values = [textbookId.trim()]
      const conditions: string[] = []

      const normalizedDocumentType = normalizeDocumentType(documentType)
      if (normalizedDocumentType) {
        values.push(normalizedDocumentType)
        conditions.push(`t.document_type = $${values.length}`)
      }

      const courseCondition = normalizeOptionalText(courseId)
      if (courseCondition) {
        values.push(courseCondition)
        conditions.push(`t.course_id = $${values.length}`)
      }
      const extraSql = conditions.length ? ` AND ${conditions.join(' AND ')}` : ''

      const textbookResult = await getQuestionBankPoolInstance().query<{
        id: string
        textbookId: string
        courseId: string
        documentType: string
        title: string
        subject: string
        publisher: string | null
        version: string
        examType: string | null
        hasAnswer: boolean | null
        createdBy: string | null
        sourceFileName: string
        updatedAt: string
      }>(
        `
          SELECT
            t.id,
            t.external_id AS "textbookId",
            t.course_id AS "courseId",
            t.document_type AS "documentType",
            t.title,
            t.subject,
            t.publisher,
            t.version,
            t.exam_type AS "examType",
            t.has_answer AS "hasAnswer",
            t.created_by AS "createdBy",
            t.source_file_name AS "sourceFileName",
            t.updated_at AS "updatedAt"
          FROM ${tableName('textbooks')} t
          WHERE t.external_id = $1${extraSql}
          LIMIT 1
        `,
        values,
      )

      const textbook = textbookResult.rows[0]
      if (!textbook) {
        throw new Error(`未找到来源文档: ${textbookId}`)
      }

      const [schoolScopeResult, chapterCountResult, questionCountResult] = await Promise.all([
        getQuestionBankPoolInstance().query<{ schoolId: string }>(
          `
            SELECT school_id AS "schoolId"
            FROM ${tableName('question_bank_textbook_schools')}
            WHERE textbook_id = $1
            ORDER BY school_id ASC
          `,
          [textbook.id],
        ),
        getQuestionBankPoolInstance().query<{ chapterCount: string }>(
          `
            SELECT COUNT(*)::text AS "chapterCount"
            FROM ${tableName('chapters')}
            WHERE textbook_id = $1
          `,
          [textbook.id],
        ),
        getQuestionBankPoolInstance().query<{
          total: string
          leafCount: string
          groupCount: string
          childCount: string
        }>(
          `
            SELECT
              COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE node_type = 'LEAF' AND parent_id IS NULL)::text AS "leafCount",
              COUNT(*) FILTER (WHERE node_type = 'GROUP')::text AS "groupCount",
              COUNT(*) FILTER (WHERE parent_id IS NOT NULL)::text AS "childCount"
            FROM ${tableName('assignment_questions')}
            WHERE textbook_id = $1
          `,
          [textbook.id],
        ),
      ])

      return buildToolResult('来源文档详情', {
        schema: getQuestionBankDbSchemaName(),
        textbook: {
          ...textbook,
          chapterCount: toNumber(chapterCountResult.rows[0]?.chapterCount),
          questionStats: {
            total: toNumber(questionCountResult.rows[0]?.total),
            leaf: toNumber(questionCountResult.rows[0]?.leafCount),
            group: toNumber(questionCountResult.rows[0]?.groupCount),
            child: toNumber(questionCountResult.rows[0]?.childCount),
          },
          schoolIds: schoolScopeResult.rows.map((row) => row.schoolId),
        },
      })
    },
  )

  server.registerTool(
    'list_chapters',
    {
      description: '列出结构节点，适合定位教材章节或试卷结构。',
      annotations: {
        title: '结构节点列表',
        readOnlyHint: true,
      },
      inputSchema: {
        textbookId: z.string().optional().describe('可选，按来源 external_id 过滤'),
        documentType: z.enum(['textbook', 'exam']).optional().describe('可选，按来源类型过滤'),
        courseId: z.string().optional().describe('可选，按 course_id 过滤'),
        parentChapterId: z.string().optional().describe('可选，只看某个父章节下的直接节点'),
        keyword: z.string().optional().describe('可选，按章节标题模糊匹配'),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      },
    },
    async ({ textbookId, documentType, courseId, parentChapterId, keyword, limit }) => {
      const conditions: string[] = []
      const values: string[] = []

      const normalizedTextbookId = normalizeOptionalText(textbookId)
      if (normalizedTextbookId) {
        values.push(normalizedTextbookId)
        conditions.push(`t.external_id = $${values.length}`)
      }

      const normalizedDocumentType = normalizeDocumentType(documentType)
      if (normalizedDocumentType) {
        values.push(normalizedDocumentType)
        conditions.push(`t.document_type = $${values.length}`)
      }

      const normalizedCourseId = normalizeOptionalText(courseId)
      if (normalizedCourseId) {
        values.push(normalizedCourseId)
        conditions.push(`t.course_id = $${values.length}`)
      }

      const normalizedParentChapterId = normalizeOptionalText(parentChapterId)
      if (normalizedParentChapterId) {
        values.push(normalizedParentChapterId)
        conditions.push(`pc.external_id = $${values.length}`)
      }

      const normalizedKeyword = normalizeKeyword(keyword)
      if (normalizedKeyword) {
        values.push(normalizedKeyword)
        conditions.push(`c.title ILIKE $${values.length}`)
      }

      values.push(String(limit))
      const result = await getQuestionBankPoolInstance().query<{
        chapterId: string
        chapterTitle: string
        orderNo: number | null
        parentChapterId: string | null
        textbookId: string
        textbookTitle: string
        documentType: string
        examType: string | null
        hasAnswer: boolean | null
        courseId: string
      }>(
        `
          SELECT
            c.external_id AS "chapterId",
            c.title AS "chapterTitle",
            c.order_no AS "orderNo",
            pc.external_id AS "parentChapterId",
            t.external_id AS "textbookId",
            t.title AS "textbookTitle",
            t.document_type AS "documentType",
            t.exam_type AS "examType",
            t.has_answer AS "hasAnswer",
            t.course_id AS "courseId"
          FROM ${tableName('chapters')} c
          INNER JOIN ${tableName('textbooks')} t ON t.id = c.textbook_id
          LEFT JOIN ${tableName('chapters')} pc ON pc.id = c.parent_id
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY t.updated_at DESC, t.title ASC, COALESCE(pc.order_no, 0) ASC, c.order_no ASC, c.title ASC
          LIMIT $${values.length}
        `,
        values,
      )

      return buildToolResult('结构节点列表', {
        schema: getQuestionBankDbSchemaName(),
        items: result.rows,
      })
    },
  )

  server.registerTool(
    'resolve_assignment_question_reference',
    {
      description:
        '解析“习题10.2第2题”“第1小题”“q_10_2_2”这类固定题目引用，返回最可能对应的 questionCode，适合先做精确定位，再配合题目详情工具读取完整题干与答案。',
      annotations: {
        title: '题目引用解析',
        readOnlyHint: true,
      },
      inputSchema: {
        reference: z.string().describe('用户提到的固定题目引用，例如“习题10.2的第二题”或“q_10_2_2”'),
        textbookId: z.string().optional().describe('可选，按来源 external_id 限定解析范围'),
        documentType: z.enum(['textbook', 'exam']).optional().describe('可选，按来源类型限定解析范围'),
        courseId: z.string().optional().describe('可选，按 course_id 限定解析范围'),
        status: z.string().optional().describe('可选，默认只查 ACTIVE'),
        limit: z.coerce.number().int().min(1).max(10).default(5),
      },
    },
    async ({ reference, textbookId, documentType, courseId, status, limit }) => {
      const parsed = parseAssignmentQuestionReference(reference)
      const normalizedLimit = normalizeOptionalNumber(limit, 5, 1, 10)

      if (!parsed.isSpecificReference) {
        return buildToolResult('题目引用解析结果', {
          schema: getQuestionBankDbSchemaName(),
          reference: parsed.rawReference,
          parsed,
          matches: [],
        })
      }

      const buildScopeConditions = (values: string[]) => {
        const conditions: string[] = []

        const normalizedTextbookId = normalizeOptionalText(textbookId)
        if (normalizedTextbookId) {
          values.push(normalizedTextbookId)
          conditions.push(`t.external_id = $${values.length}`)
        }

        const normalizedDocumentType = normalizeDocumentType(documentType)
        if (normalizedDocumentType) {
          values.push(normalizedDocumentType)
          conditions.push(`t.document_type = $${values.length}`)
        }

        const normalizedCourseId = normalizeOptionalText(courseId)
        if (normalizedCourseId) {
          values.push(normalizedCourseId)
          conditions.push(`q.course_id = $${values.length}`)
        }

        const normalizedStatus = normalizeOptionalText(status) || 'ACTIVE'
        values.push(normalizedStatus)
        conditions.push(`q.status = $${values.length}`)

        return conditions
      }

      const runLookupQuery = async (params: {
        whereClauses: string[]
        values: string[]
        matchedBy: 'questionCode' | 'canonicalTitle'
      }) => {
        if (!params.whereClauses.length) {
          return [] as Array<{
            questionCode: string
            nodeType: string
            questionType: string
            status: string
            title: string
            chapterId: string | null
            chapterTitle: string | null
            textbookId: string
            textbookTitle: string
            documentType: string
            examType: string | null
            hasAnswer: boolean | null
            courseId: string
            parentQuestionCode: string | null
            childCount: string
            matchedBy: 'questionCode' | 'canonicalTitle'
          }>
        }

        params.values.push(String(normalizedLimit))
        const result = await getQuestionBankPoolInstance().query<{
          questionCode: string
          nodeType: string
          questionType: string
          status: string
          title: string
          chapterId: string | null
          chapterTitle: string | null
          textbookId: string
          textbookTitle: string
          documentType: string
          examType: string | null
          hasAnswer: boolean | null
          courseId: string
          parentQuestionCode: string | null
          childCount: string
        }>(
          `
            SELECT
              q.question_code AS "questionCode",
              q.node_type AS "nodeType",
              q.question_type AS "questionType",
              q.status,
              q.title,
              c.external_id AS "chapterId",
              c.title AS "chapterTitle",
              t.external_id AS "textbookId",
              t.title AS "textbookTitle",
              t.document_type AS "documentType",
              t.exam_type AS "examType",
              t.has_answer AS "hasAnswer",
              q.course_id AS "courseId",
              p.question_code AS "parentQuestionCode",
              (
                SELECT COUNT(*)::text
                FROM ${tableName('assignment_questions')} cq
                WHERE cq.parent_id = q.id
              ) AS "childCount"
            FROM ${tableName('assignment_questions')} q
            INNER JOIN ${tableName('textbooks')} t ON t.id = q.textbook_id
            LEFT JOIN ${tableName('chapters')} c ON c.id = q.chapter_id
            LEFT JOIN ${tableName('assignment_questions')} p ON p.id = q.parent_id
            WHERE ${params.whereClauses.join(' AND ')}
            ORDER BY
              CASE WHEN q.node_type = 'GROUP' THEN 0 ELSE 1 END ASC,
              COALESCE(q.order_no, 0) ASC,
              q.question_code ASC
            LIMIT $${params.values.length}
          `,
          params.values,
        )

        return result.rows.map((row) => ({
          ...row,
          matchedBy: params.matchedBy,
        }))
      }

      const codeQueryValues: string[] = []
      const codeQueryConditions = buildScopeConditions(codeQueryValues)
      if (parsed.questionCodeCandidates.length) {
        const codeConditions = parsed.questionCodeCandidates.map((questionCode) => {
          codeQueryValues.push(questionCode)
          return `q.question_code = $${codeQueryValues.length}`
        })
        codeQueryConditions.push(`(${codeConditions.join(' OR ')})`)
      }

      const titleQueryValues: string[] = []
      const titleQueryConditions = buildScopeConditions(titleQueryValues)
      if (parsed.sectionTitle) {
        titleQueryValues.push(parsed.sectionTitle)
        titleQueryConditions.push(`c.title = $${titleQueryValues.length}`)
      }
      if (parsed.titleCandidates.length) {
        const titleConditions = parsed.titleCandidates.map((title) => {
          titleQueryValues.push(title)
          return `q.title = $${titleQueryValues.length}`
        })
        titleQueryConditions.push(`(${titleConditions.join(' OR ')})`)
      }

      const codeMatches = await runLookupQuery({
        whereClauses: codeQueryConditions,
        values: codeQueryValues,
        matchedBy: 'questionCode',
      })

      const titleMatches =
        codeMatches.length || !parsed.sectionTitle || !parsed.titleCandidates.length
          ? []
          : await runLookupQuery({
              whereClauses: titleQueryConditions,
              values: titleQueryValues,
              matchedBy: 'canonicalTitle',
            })

      const matches = dedupeStrings(
        [...codeMatches, ...titleMatches].map((item) => item.questionCode),
      )
        .map((questionCode) => [...codeMatches, ...titleMatches].find((item) => item.questionCode === questionCode))
        .filter(
          (
            item,
          ): item is {
            questionCode: string
            nodeType: string
            questionType: string
            status: string
            title: string
            chapterId: string | null
            chapterTitle: string | null
            textbookId: string
            textbookTitle: string
            documentType: string
            examType: string | null
            hasAnswer: boolean | null
            courseId: string
            parentQuestionCode: string | null
            childCount: string
            matchedBy: 'questionCode' | 'canonicalTitle'
          } => Boolean(item),
        )

      return buildToolResult('题目引用解析结果', {
        schema: getQuestionBankDbSchemaName(),
        reference: parsed.rawReference,
        parsed,
        matches: matches.map((item) => ({
          ...item,
          childCount: toNumber(item.childCount),
        })),
      })
    },
  )

  server.registerTool(
    'search_assignment_questions',
    {
      description: '搜索题目列表，适合做宽召回。会同时搜索标题、描述、章节标题、题干、prompt、标准答案和原始 JSON。questionType 是严格字段过滤，不适合拿来做语义判断。',
      annotations: {
        title: '题目搜索',
        readOnlyHint: true,
      },
      inputSchema: {
        query: z.string().optional().describe('可选，按标题、描述、章节标题、题干、prompt、标准答案、question_code、原始 JSON 宽搜索'),
        textbookId: z.string().optional().describe('可选，按来源 external_id 过滤'),
        documentType: z.enum(['textbook', 'exam']).optional().describe('可选，按来源类型过滤'),
        courseId: z.string().optional().describe('可选，按 course_id 过滤'),
        chapterId: z.string().optional().describe('可选，按章节 external_id 过滤'),
        questionCode: z.string().optional().describe('可选，按题号精确过滤，如 q_2_1_1'),
        nodeType: z.enum(['LEAF', 'GROUP']).optional(),
        questionType: z.string().optional().describe('可选，严格按 question_type 精确匹配；如果只是“疑似某类题”，不要传'),
        status: z.string().optional().describe('可选，默认只查 ACTIVE'),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      },
    },
    async ({ query, textbookId, documentType, courseId, chapterId, questionCode, nodeType, questionType, status, limit }) => {
      const resultRows = await loadQuestionCandidates({
        query,
        textbookId,
        documentType,
        courseId,
        chapterId,
        questionCode,
        nodeType,
        questionType,
        status: status || 'ACTIVE',
        limit: normalizeOptionalNumber(limit, 10, 1, 50),
      })

      return buildToolResult('题目搜索结果', {
        schema: getQuestionBankDbSchemaName(),
        items: resultRows.map((row) => ({
          ...row,
          defaultScore: toNumber(row.defaultScore),
          relevanceScore: toNumber(row.relevanceScore),
          titlePreview: compactText(row.title, 120),
          descriptionPreview: compactText(row.description, 160),
          contentPreview: buildQuestionContentPreview(row, 200),
        })),
      })
    },
  )

  server.registerTool(
    'screen_assignment_question_candidates',
    {
      description:
        '按自然语言要求筛题。先从数据库宽召回疑似题目，再由大模型判断哪些题真正符合要求。适合“是不是行列式计算题”“难度中等”这类不能靠固定字段硬筛的场景。',
      annotations: {
        title: '候选题筛选',
        readOnlyHint: true,
      },
      inputSchema: {
        requirement: z.string().describe('用户的自然语言要求，例如“找一道中等难度的行列式计算题”'),
        query: z.string().optional().describe('可选，补充一个更短的检索关键词；如果不传，会从 requirement 自动提取'),
        textbookId: z.string().optional().describe('可选，按来源 external_id 限定召回范围'),
        documentType: z.enum(['textbook', 'exam']).optional().describe('可选，按来源类型限定召回范围'),
        courseId: z.string().optional().describe('可选，按 course_id 限定召回范围'),
        chapterId: z.string().optional().describe('可选，按章节 external_id 限定召回范围'),
        questionTypeHint: z.string().optional().describe('可选，只作为模型判断提示，不做数据库硬过滤'),
        status: z.string().optional().describe('可选，默认只查 ACTIVE'),
        candidateLimit: z.coerce.number().int().min(3).max(20).default(12),
        matchLimit: z.coerce.number().int().min(1).max(10).default(5),
      },
    },
    async ({ requirement, query, textbookId, documentType, courseId, chapterId, questionTypeHint, status, candidateLimit, matchLimit }) => {
      const normalizedRequirement = normalizeOptionalText(requirement)
      if (!normalizedRequirement) {
        throw new Error('requirement 不能为空')
      }

      const recallKeywords = deriveRecallKeywords(normalizedRequirement, query)
      const candidates = await loadQuestionCandidates({
        query: normalizeOptionalText(query) || recallKeywords[0] || normalizedRequirement,
        extraQueries: recallKeywords.slice(1),
        textbookId,
        documentType,
        courseId,
        chapterId,
        status: status || 'ACTIVE',
        limit: normalizeOptionalNumber(candidateLimit, 12, 3, 20),
      })

      if (!candidates.length) {
        return buildToolResult('候选题筛选结果', {
          schema: getQuestionBankDbSchemaName(),
          recallKeywords,
          requirement: normalizedRequirement,
          totalCandidates: 0,
          matches: [],
        })
      }

      const screenedMatches = await judgeQuestionCandidates({
        requirement: normalizedRequirement,
        questionTypeHint: normalizeOptionalText(questionTypeHint) || undefined,
        candidates,
        matchLimit: normalizeOptionalNumber(matchLimit, 5, 1, 10),
      })

      return buildToolResult('候选题筛选结果', {
        schema: getQuestionBankDbSchemaName(),
        requirement: normalizedRequirement,
        recallKeywords,
        totalCandidates: candidates.length,
        candidatePreview: candidates.slice(0, 5).map((candidate) => ({
          questionCode: candidate.questionCode,
          title: compactText(candidate.title, 90),
          chapterTitle: candidate.chapterTitle,
          textbookId: candidate.textbookId,
          documentType: candidate.documentType,
          examType: candidate.examType,
          hasAnswer: candidate.hasAnswer,
          questionType: candidate.questionType,
          relevanceScore: toNumber(candidate.relevanceScore),
          contentPreview: buildQuestionContentPreview(candidate, 180),
        })),
        matches: screenedMatches,
      })
    },
  )

  server.registerTool(
    'get_assignment_question_detail',
    {
      description: '读取单题完整详情，包含题干、题目内容、标准答案、评分规则和上下文信息。',
      annotations: {
        title: '题目详情',
        readOnlyHint: true,
      },
      inputSchema: {
        questionCode: z.string().describe('题号，如 q_2_1_1'),
        textbookId: z.string().optional().describe('可选，按来源 external_id 限定'),
        documentType: z.enum(['textbook', 'exam']).optional().describe('可选，按来源类型限定'),
        courseId: z.string().optional().describe('可选，按 course_id 限定'),
      },
    },
    async ({ questionCode, textbookId, documentType, courseId }) => {
      const { conditions, values } = buildQuestionSearchConditions({
        questionCode,
        textbookId,
        documentType,
        courseId,
      })
      values.push('2')

      const result = await getQuestionBankPoolInstance().query<{
        id: string
        questionCode: string
        nodeType: string
        questionType: string
        status: string
        title: string
        description: string
        defaultScore: string
        orderNo: number | null
        stem: unknown
        prompt: unknown
        standardAnswer: unknown
        rubric: unknown
        questionSchema: unknown
        gradingPolicy: unknown
        rawPayloadJson: unknown
        chapterId: string | null
        chapterTitle: string | null
        parentQuestionCode: string | null
        textbookId: string
        textbookTitle: string
        documentType: string
        examType: string | null
        hasAnswer: boolean | null
        courseId: string
      }>(
        `
          SELECT
            q.id,
            q.question_code AS "questionCode",
            q.node_type AS "nodeType",
            q.question_type AS "questionType",
            q.status,
            q.title,
            q.description,
            q.default_score::text AS "defaultScore",
            q.order_no AS "orderNo",
            q.stem,
            q.prompt,
            q.standard_answer AS "standardAnswer",
            q.rubric,
            q.question_schema AS "questionSchema",
            q.grading_policy AS "gradingPolicy",
            q.raw_payload_json AS "rawPayloadJson",
            c.external_id AS "chapterId",
            c.title AS "chapterTitle",
            p.question_code AS "parentQuestionCode",
            t.external_id AS "textbookId",
            t.title AS "textbookTitle",
            t.document_type AS "documentType",
            t.exam_type AS "examType",
            t.has_answer AS "hasAnswer",
            q.course_id AS "courseId"
          FROM ${tableName('assignment_questions')} q
          INNER JOIN ${tableName('textbooks')} t ON t.id = q.textbook_id
          LEFT JOIN ${tableName('chapters')} c ON c.id = q.chapter_id
          LEFT JOIN ${tableName('assignment_questions')} p ON p.id = q.parent_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY q.updated_at DESC
          LIMIT $${values.length}
        `,
        values,
      )

      if (!result.rows.length) {
        throw new Error(`未找到题目: ${questionCode}`)
      }
      if (result.rows.length > 1) {
        throw new Error(`题号 ${questionCode} 匹配到多条记录，请补充 textbookId、documentType 或 courseId`)
      }

      const question = result.rows[0]
      const childrenResult =
        question.nodeType === 'GROUP'
          ? await getQuestionBankPoolInstance().query<{
              questionCode: string
              title: string
              orderNo: number | null
              questionType: string
              prompt: unknown
              standardAnswer: unknown
              defaultScore: string
            }>(
              `
                SELECT
                  question_code AS "questionCode",
                  title,
                  order_no AS "orderNo",
                  question_type AS "questionType",
                  prompt,
                  standard_answer AS "standardAnswer",
                  default_score::text AS "defaultScore"
                FROM ${tableName('assignment_questions')}
                WHERE parent_id = $1
                ORDER BY order_no ASC NULLS LAST, question_code ASC
              `,
              [question.id],
            )
          : { rows: [] }

      return buildToolResult('题目详情', {
        schema: getQuestionBankDbSchemaName(),
        question: {
          questionCode: question.questionCode,
          nodeType: question.nodeType,
          questionType: question.questionType,
          status: question.status,
          title: question.title,
          description: question.description,
          defaultScore: toNumber(question.defaultScore),
          orderNo: question.orderNo,
          chapterId: question.chapterId,
          chapterTitle: question.chapterTitle,
          parentQuestionCode: question.parentQuestionCode,
          textbookId: question.textbookId,
          textbookTitle: question.textbookTitle,
          documentType: question.documentType,
          examType: question.examType,
          hasAnswer: question.hasAnswer,
          courseId: question.courseId,
          stem: toJsonObject(question.stem),
          prompt: toJsonObject(question.prompt),
          standardAnswer: toJsonObject(question.standardAnswer),
          rubric: toJsonObject(question.rubric),
          questionSchema: toJsonObject(question.questionSchema),
          gradingPolicy: toJsonObject(question.gradingPolicy),
          rawPayloadJson: toJsonObject(question.rawPayloadJson),
          children: childrenResult.rows.map((row) => ({
            ...row,
            defaultScore: toNumber(row.defaultScore),
            prompt: toJsonObject(row.prompt),
            standardAnswer: toJsonObject(row.standardAnswer),
          })),
        },
      })
    },
  )

  server.registerTool(
    'list_question_bank_papers',
    {
      description: '列出教师保存的试卷模板。',
      annotations: {
        title: '试卷模板',
        readOnlyHint: true,
      },
      inputSchema: {
        schoolId: z.string().optional().describe('可选，按 school_id 过滤'),
        createdBy: z.string().optional().describe('可选，按 created_by 过滤'),
        keyword: z.string().optional().describe('可选，按试卷名称模糊搜索'),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      },
    },
    async ({ schoolId, createdBy, keyword, limit }) => {
      const conditions: string[] = []
      const values: string[] = []

      const normalizedSchoolId = normalizeOptionalText(schoolId)
      if (normalizedSchoolId) {
        values.push(normalizedSchoolId)
        conditions.push(`school_id = $${values.length}`)
      }

      const normalizedCreatedBy = normalizeOptionalText(createdBy)
      if (normalizedCreatedBy) {
        values.push(normalizedCreatedBy)
        conditions.push(`created_by = $${values.length}`)
      }

      const normalizedKeyword = normalizeKeyword(keyword)
      if (normalizedKeyword) {
        values.push(normalizedKeyword)
        conditions.push(`name ILIKE $${values.length}`)
      }

      values.push(String(limit))
      const result = await getQuestionBankPoolInstance().query<{
        id: string
        schoolId: string | null
        createdBy: string | null
        name: string
        content: unknown
        createdAt: string
        updatedAt: string
      }>(
        `
          SELECT
            id,
            school_id AS "schoolId",
            created_by AS "createdBy",
            name,
            content,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM ${tableName('question_bank_papers')}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY updated_at DESC, name ASC
          LIMIT $${values.length}
        `,
        values,
      )

      return buildToolResult('试卷模板列表', {
        schema: getQuestionBankDbSchemaName(),
        items: result.rows.map((row) => ({
          ...row,
          content: toJsonObject(row.content),
        })),
      })
    },
  )

  return server
}
