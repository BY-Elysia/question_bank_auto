import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
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

function normalizeSearchKeyword(value: string | undefined) {
  const keyword = String(value || '').trim()
  return keyword ? `%${keyword}%` : ''
}

function sanitizeReadonlySql(sql: string) {
  const normalized = String(sql || '').trim().replace(/;+\s*$/g, '')
  if (!normalized) {
    throw new Error('SQL 不能为空')
  }
  if (!/^(select|with)\b/i.test(normalized)) {
    throw new Error('只允许执行 SELECT 或 WITH 查询')
  }
  if (normalized.includes(';')) {
    throw new Error('只允许执行单条 SQL 语句')
  }
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|copy|merge|call|vacuum|analyze|refresh)\b/i.test(normalized)) {
    throw new Error('检测到非只读 SQL 关键字，已拒绝执行')
  }
  return normalized
}

async function runReadonlySql(sql: string, rowLimit: number) {
  const client = await getQuestionBankPoolInstance().connect()
  const schemaName = getQuestionBankDbSchemaName()
  const safeLimit = Math.max(1, Math.min(200, Number(rowLimit) || 50))
  const normalizedSql = sanitizeReadonlySql(sql)
  const wrappedSql = `SELECT * FROM (${normalizedSql}) AS mcp_query LIMIT ${safeLimit}`

  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL TRANSACTION READ ONLY')
    await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schemaName)}`)
    await client.query("SET LOCAL statement_timeout TO '5000ms'")
    const result = await client.query(wrappedSql)
    return {
      rowCount: Number(result.rowCount || 0),
      rows: result.rows,
      truncatedTo: safeLimit,
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }
}

export function createQuestionBankMcpServer() {
  const server = new McpServer({
    name: 'question-bank-mcp-server',
    version: '1.0.0',
  })

  server.registerTool(
    'get_schema_overview',
    {
      description: '读取题库 PostgreSQL schema 的教材、章节、题目总览统计。',
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
        textbooks: summary.textbooks.slice(0, 10),
      })
    },
  )

  server.registerTool(
    'list_textbooks',
    {
      description: '列出题库中的教材，并附带章节数和题目数。',
      annotations: {
        title: '列出教材',
        readOnlyHint: true,
      },
      inputSchema: {
        courseId: z.string().optional().describe('可选，按 courseId 精确过滤'),
        keyword: z.string().optional().describe('可选，按教材标题或学科模糊搜索'),
        limit: z.coerce.number().int().min(1).max(50).default(20).describe('返回条数，默认 20'),
      },
    },
    async ({ courseId, keyword, limit }) => {
      const conditions: string[] = []
      const values: string[] = []

      if (courseId?.trim()) {
        values.push(courseId.trim())
        conditions.push(`t.course_id = $${values.length}`)
      }

      const keywordSearch = normalizeSearchKeyword(keyword)
      if (keywordSearch) {
        values.push(keywordSearch)
        conditions.push(`(t.title ILIKE $${values.length} OR t.subject ILIKE $${values.length})`)
      }

      values.push(String(limit))
      const result = await getQuestionBankPoolInstance().query<{
        courseId: string
        textbookId: string
        title: string
        subject: string
        publisher: string | null
        version: string
        sourceFileName: string
        updatedAt: string
        chapters: string
        questionRows: string
        groupQuestions: string
        leafQuestions: string
        childQuestions: string
      }>(
        `
          SELECT
            t.course_id AS "courseId",
            t.external_id AS "textbookId",
            t.title,
            t.subject,
            t.publisher,
            t.version,
            t.source_file_name AS "sourceFileName",
            t.updated_at AS "updatedAt",
            COUNT(DISTINCT c.id)::text AS "chapters",
            COUNT(DISTINCT q.id)::text AS "questionRows",
            COUNT(DISTINCT CASE WHEN q.node_type = 'GROUP' THEN q.id END)::text AS "groupQuestions",
            COUNT(DISTINCT CASE WHEN q.node_type = 'LEAF' AND q.parent_id IS NULL THEN q.id END)::text AS "leafQuestions",
            COUNT(DISTINCT CASE WHEN q.parent_id IS NOT NULL THEN q.id END)::text AS "childQuestions"
          FROM ${tableName('textbooks')} t
          LEFT JOIN ${tableName('chapters')} c ON c.textbook_id = t.id
          LEFT JOIN ${tableName('question_bank_questions')} q ON q.textbook_id = t.id
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
          chapters: Number(row.chapters || 0),
          questionRows: Number(row.questionRows || 0),
          groupQuestions: Number(row.groupQuestions || 0),
          leafQuestions: Number(row.leafQuestions || 0),
          childQuestions: Number(row.childQuestions || 0),
        })),
      })
    },
  )

  server.registerTool(
    'list_chapters',
    {
      description: '按教材或关键词列出章节树节点。',
      annotations: {
        title: '列出章节',
        readOnlyHint: true,
      },
      inputSchema: {
        textbookId: z.string().optional().describe('可选，按教材 external_id 过滤'),
        courseId: z.string().optional().describe('可选，按 courseId 过滤'),
        parentChapterId: z.string().optional().describe('可选，按父章节 external_id 过滤'),
        keyword: z.string().optional().describe('可选，按章节标题模糊搜索'),
        limit: z.coerce.number().int().min(1).max(100).default(50).describe('返回条数，默认 50'),
      },
    },
    async ({ textbookId, courseId, parentChapterId, keyword, limit }) => {
      const conditions: string[] = []
      const values: string[] = []

      if (textbookId?.trim()) {
        values.push(textbookId.trim())
        conditions.push(`t.external_id = $${values.length}`)
      }
      if (courseId?.trim()) {
        values.push(courseId.trim())
        conditions.push(`t.course_id = $${values.length}`)
      }
      if (parentChapterId?.trim()) {
        values.push(parentChapterId.trim())
        conditions.push(`pc.external_id = $${values.length}`)
      }

      const keywordSearch = normalizeSearchKeyword(keyword)
      if (keywordSearch) {
        values.push(keywordSearch)
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
    'search_questions',
    {
      description: '按关键词、教材或章节搜索题目。',
      annotations: {
        title: '搜索题目',
        readOnlyHint: true,
      },
      inputSchema: {
        query: z.string().optional().describe('可选，按题目标题、描述或 external_id 模糊搜索'),
        textbookId: z.string().optional().describe('可选，按教材 external_id 过滤'),
        courseId: z.string().optional().describe('可选，按 courseId 过滤'),
        chapterId: z.string().optional().describe('可选，按章节 external_id 过滤'),
        nodeType: z.enum(['LEAF', 'GROUP']).optional().describe('可选，按题目节点类型过滤'),
        questionType: z.string().optional().describe('可选，按 questionType 过滤'),
        limit: z.coerce.number().int().min(1).max(50).default(10).describe('返回条数，默认 10'),
      },
    },
    async ({ query, textbookId, courseId, chapterId, nodeType, questionType, limit }) => {
      const conditions: string[] = []
      const values: string[] = []

      const keywordSearch = normalizeSearchKeyword(query)
      if (keywordSearch) {
        values.push(keywordSearch)
        conditions.push(
          `(q.title ILIKE $${values.length} OR q.description ILIKE $${values.length} OR q.external_id ILIKE $${values.length})`,
        )
      }
      if (textbookId?.trim()) {
        values.push(textbookId.trim())
        conditions.push(`t.external_id = $${values.length}`)
      }
      if (courseId?.trim()) {
        values.push(courseId.trim())
        conditions.push(`t.course_id = $${values.length}`)
      }
      if (chapterId?.trim()) {
        values.push(chapterId.trim())
        conditions.push(`c.external_id = $${values.length}`)
      }
      if (nodeType) {
        values.push(nodeType)
        conditions.push(`q.node_type = $${values.length}`)
      }
      if (questionType?.trim()) {
        values.push(questionType.trim())
        conditions.push(`q.question_type = $${values.length}`)
      }
      if (!conditions.length) {
        throw new Error('至少提供 query、textbookId、courseId、chapterId、nodeType 或 questionType 其中一个条件')
      }

      values.push(String(limit))
      const result = await getQuestionBankPoolInstance().query<{
        questionId: string
        nodeType: string
        title: string
        description: string
        questionType: string
        orderNo: number | null
        chapterId: string
        chapterTitle: string
        textbookId: string
        textbookTitle: string
        courseId: string
      }>(
        `
          SELECT
            q.external_id AS "questionId",
            q.node_type AS "nodeType",
            q.title,
            q.description,
            q.question_type AS "questionType",
            q.order_no AS "orderNo",
            c.external_id AS "chapterId",
            c.title AS "chapterTitle",
            t.external_id AS "textbookId",
            t.title AS "textbookTitle",
            t.course_id AS "courseId"
          FROM ${tableName('question_bank_questions')} q
          INNER JOIN ${tableName('chapters')} c ON c.id = q.chapter_id
          INNER JOIN ${tableName('textbooks')} t ON t.id = q.textbook_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY t.updated_at DESC, c.order_no ASC NULLS LAST, q.order_no ASC NULLS LAST, q.title ASC
          LIMIT $${values.length}
        `,
        values,
      )

      return buildToolResult('题目搜索结果', {
        schema: getQuestionBankDbSchemaName(),
        items: result.rows,
      })
    },
  )

  server.registerTool(
    'run_readonly_sql',
    {
      description: '执行只读 SQL 查询。仅允许 SELECT/WITH，且自动限制返回行数。',
      annotations: {
        title: '只读 SQL',
        readOnlyHint: true,
      },
      inputSchema: {
        sql: z.string().describe('只读 SQL，必须是 SELECT 或 WITH 语句'),
        rowLimit: z.coerce.number().int().min(1).max(200).default(50).describe('自动截断的最大返回行数'),
      },
    },
    async ({ sql, rowLimit }) => {
      const result = await runReadonlySql(sql, rowLimit)
      return buildToolResult('只读 SQL 查询结果', {
        schema: getQuestionBankDbSchemaName(),
        ...result,
      })
    },
  )

  return server
}
