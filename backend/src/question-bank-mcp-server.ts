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

function deriveRecallKeywords(requirement: string, query?: string) {
  const rawTexts = dedupeStrings([query || '', requirement || ''])
  const variants = new Set<string>()
  const removablePhrases = [
    '中等难度',
    '较难',
    '偏难',
    '简单',
    '容易',
    '困难',
    '难度',
    '帮我',
    '给我',
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
    '中的',
    '关于',
    '属于',
    '是不是',
    '是否',
    '可以',
    '线性代数习题册',
    '线性代数',
  ]
  const removableVerbs = ['计算', '求解', '求', '解', '判断', '证明', '化简', '完成']

  for (const rawText of rawTexts) {
    const normalized = rawText
      .replace(/[，。,.、；;：:！？?!（）()\[\]【】"'“”‘’]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!normalized) {
      continue
    }

    variants.add(normalized)

    let stripped = normalized
    for (const phrase of removablePhrases) {
      stripped = stripped.replaceAll(phrase, ' ')
    }
    stripped = stripped.replace(/\s+/g, ' ').trim()
    if (stripped) {
      variants.add(stripped)
    }

    let nounLike = stripped
    for (const verb of removableVerbs) {
      nounLike = nounLike.replaceAll(verb, ' ')
    }
    nounLike = nounLike.replace(/\s+/g, ' ').trim()
    if (nounLike) {
      variants.add(nounLike)
    }

    for (const token of normalized.split(/\s+/)) {
      if (token.length >= 2) {
        variants.add(token)
      }
    }
    for (const token of stripped.split(/\s+/)) {
      if (token.length >= 2) {
        variants.add(token)
      }
    }
    for (const token of nounLike.split(/\s+/)) {
      if (token.length >= 2) {
        variants.add(token)
      }
    }
  }

  return [...variants].filter((item) => item.length >= 2).slice(0, 8)
}

function buildQuestionKeywordCondition(keywordParamIndex: number) {
  return [
    `q.title ILIKE $${keywordParamIndex}`,
    `q.description ILIKE $${keywordParamIndex}`,
    `q.question_code ILIKE $${keywordParamIndex}`,
    `COALESCE(c.title, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.stem::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.prompt::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.standard_answer::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.rubric::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.question_schema::text, '') ILIKE $${keywordParamIndex}`,
    `COALESCE(q.raw_payload_json::text, '') ILIKE $${keywordParamIndex}`,
  ].join(' OR ')
}

function buildQuestionSearchConditions(params: {
  query?: string
  extraQueries?: string[]
  textbookId?: string
  courseId?: string
  chapterId?: string
  questionCode?: string
  nodeType?: 'LEAF' | 'GROUP'
  questionType?: string
  status?: string
}) {
  const conditions: string[] = []
  const values: string[] = []

  const textQueries = dedupeStrings([params.query || '', ...(params.extraQueries || [])])
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
  courseId: string
  defaultScore: string
  stem: unknown
  prompt: unknown
  standardAnswer: unknown
  rawPayloadJson: unknown
}

async function loadQuestionCandidates(params: {
  query?: string
  extraQueries?: string[]
  textbookId?: string
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

  values.push(String(params.limit))
  const result = await getQuestionBankPoolInstance().query<QuestionCandidateRow>(
    `
      SELECT
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
        q.course_id AS "courseId",
        q.default_score::text AS "defaultScore",
        q.stem,
        q.prompt,
        q.standard_answer AS "standardAnswer",
        q.raw_payload_json AS "rawPayloadJson"
      FROM ${tableName('assignment_questions')} q
      INNER JOIN ${tableName('textbooks')} t ON t.id = q.textbook_id
      LEFT JOIN ${tableName('chapters')} c ON c.id = q.chapter_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.updated_at DESC, COALESCE(c.order_no, 0) ASC, q.order_no ASC NULLS LAST, q.question_code ASC
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
    chapterId: candidate.chapterId,
    chapterTitle: candidate.chapterTitle,
    defaultScore: toNumber(candidate.defaultScore),
    title: compactText(candidate.title, 300),
    description: compactText(candidate.description, 400),
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
        chapterId: candidate.chapterId,
        chapterTitle: candidate.chapterTitle,
        title: candidate.title,
        description: candidate.description,
        defaultScore: toNumber(candidate.defaultScore),
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
      description: '读取题库 schema 的五张核心表说明，以及教材、章节、题目总量。',
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
          textbooks: ['id', 'course_id', 'external_id', 'title', 'subject', 'publisher', 'version', 'created_by'],
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
      description: '列出教材，支持按课程或关键词过滤，并返回章节数和题目数。',
      annotations: {
        title: '教材列表',
        readOnlyHint: true,
      },
      inputSchema: {
        courseId: z.string().optional().describe('可选，按 course_id 过滤'),
        keyword: z.string().optional().describe('可选，按教材标题、学科、出版社模糊匹配'),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      },
    },
    async ({ courseId, keyword, limit }) => {
      const conditions: string[] = []
      const values: string[] = []

      const normalizedCourseId = normalizeOptionalText(courseId)
      if (normalizedCourseId) {
        values.push(normalizedCourseId)
        conditions.push(`t.course_id = $${values.length}`)
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
        title: string
        subject: string
        publisher: string | null
        version: string
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
            t.title,
            t.subject,
            t.publisher,
            t.version,
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

      return buildToolResult('教材列表', {
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
      description: '读取单本教材的详细信息，包括学校可见范围、章节统计和题目统计。',
      annotations: {
        title: '教材详情',
        readOnlyHint: true,
      },
      inputSchema: {
        textbookId: z.string().describe('教材 external_id'),
        courseId: z.string().optional().describe('可选，辅助限定 course_id'),
      },
    },
    async ({ textbookId, courseId }) => {
      const values = [textbookId.trim()]
      const courseCondition = normalizeOptionalText(courseId)
      const courseSql = courseCondition ? ` AND t.course_id = $2` : ''
      if (courseCondition) {
        values.push(courseCondition)
      }

      const textbookResult = await getQuestionBankPoolInstance().query<{
        id: string
        textbookId: string
        courseId: string
        title: string
        subject: string
        publisher: string | null
        version: string
        createdBy: string | null
        sourceFileName: string
        updatedAt: string
      }>(
        `
          SELECT
            t.id,
            t.external_id AS "textbookId",
            t.course_id AS "courseId",
            t.title,
            t.subject,
            t.publisher,
            t.version,
            t.created_by AS "createdBy",
            t.source_file_name AS "sourceFileName",
            t.updated_at AS "updatedAt"
          FROM ${tableName('textbooks')} t
          WHERE t.external_id = $1${courseSql}
          LIMIT 1
        `,
        values,
      )

      const textbook = textbookResult.rows[0]
      if (!textbook) {
        throw new Error(`未找到教材: ${textbookId}`)
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

      return buildToolResult('教材详情', {
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
      description: '列出章节节点，适合定位某教材的章、小节结构。',
      annotations: {
        title: '章节列表',
        readOnlyHint: true,
      },
      inputSchema: {
        textbookId: z.string().optional().describe('可选，按教材 external_id 过滤'),
        courseId: z.string().optional().describe('可选，按 course_id 过滤'),
        parentChapterId: z.string().optional().describe('可选，只看某个父章节下的直接节点'),
        keyword: z.string().optional().describe('可选，按章节标题模糊匹配'),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      },
    },
    async ({ textbookId, courseId, parentChapterId, keyword, limit }) => {
      const conditions: string[] = []
      const values: string[] = []

      const normalizedTextbookId = normalizeOptionalText(textbookId)
      if (normalizedTextbookId) {
        values.push(normalizedTextbookId)
        conditions.push(`t.external_id = $${values.length}`)
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

      return buildToolResult('章节列表', {
        schema: getQuestionBankDbSchemaName(),
        items: result.rows,
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
        textbookId: z.string().optional().describe('可选，按教材 external_id 过滤'),
        courseId: z.string().optional().describe('可选，按 course_id 过滤'),
        chapterId: z.string().optional().describe('可选，按章节 external_id 过滤'),
        questionCode: z.string().optional().describe('可选，按题号精确过滤，如 q_2_1_1'),
        nodeType: z.enum(['LEAF', 'GROUP']).optional(),
        questionType: z.string().optional().describe('可选，严格按 question_type 精确匹配；如果只是“疑似某类题”，不要传'),
        status: z.string().optional().describe('可选，默认只查 ACTIVE'),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      },
    },
    async ({ query, textbookId, courseId, chapterId, questionCode, nodeType, questionType, status, limit }) => {
      const resultRows = await loadQuestionCandidates({
        query,
        textbookId,
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
          titlePreview: compactText(row.title, 120),
          descriptionPreview: compactText(row.description, 160),
          contentPreview: compactText(
            [
              toCompactJsonText(row.stem, 120),
              toCompactJsonText(row.prompt, 120),
              toCompactJsonText(row.standardAnswer, 80),
            ]
              .filter(Boolean)
              .join(' '),
            200,
          ),
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
        textbookId: z.string().optional().describe('可选，按教材 external_id 限定召回范围'),
        courseId: z.string().optional().describe('可选，按 course_id 限定召回范围'),
        chapterId: z.string().optional().describe('可选，按章节 external_id 限定召回范围'),
        questionTypeHint: z.string().optional().describe('可选，只作为模型判断提示，不做数据库硬过滤'),
        status: z.string().optional().describe('可选，默认只查 ACTIVE'),
        candidateLimit: z.coerce.number().int().min(3).max(20).default(12),
        matchLimit: z.coerce.number().int().min(1).max(10).default(5),
      },
    },
    async ({ requirement, query, textbookId, courseId, chapterId, questionTypeHint, status, candidateLimit, matchLimit }) => {
      const normalizedRequirement = normalizeOptionalText(requirement)
      if (!normalizedRequirement) {
        throw new Error('requirement 不能为空')
      }

      const recallKeywords = deriveRecallKeywords(normalizedRequirement, query)
      const candidates = await loadQuestionCandidates({
        query: normalizeOptionalText(query) || recallKeywords[0] || normalizedRequirement,
        extraQueries: recallKeywords.slice(1),
        textbookId,
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
          questionType: candidate.questionType,
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
        textbookId: z.string().optional().describe('可选，按教材 external_id 限定'),
        courseId: z.string().optional().describe('可选，按 course_id 限定'),
      },
    },
    async ({ questionCode, textbookId, courseId }) => {
      const { conditions, values } = buildQuestionSearchConditions({
        questionCode,
        textbookId,
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
        throw new Error(`题号 ${questionCode} 匹配到多条记录，请补充 textbookId 或 courseId`)
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
