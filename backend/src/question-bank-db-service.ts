import crypto from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { QUESTION_BANK_DATABASE_URL, QUESTION_BANK_DB_SCHEMA } from './config'
import { questionBankMigrations } from './question-bank-db-migrations'
import { isValidTextbookPayload, normalizeQuestionItem } from './question-bank-service'
import type { ChapterItem, QuestionItem, TextbookJsonPayload } from './types'

type UploadedJsonSource = {
  fileName: string
  text: string
}

type ImportQuestionRow = {
  id: string
  textbookId: string
  courseId: string
  externalId: string
  chapterId: string | null
  nodeType: 'LEAF' | 'GROUP'
  parentId: string | null
  title: string
  description: string
  stemJson: unknown | null
  promptJson: unknown | null
  standardAnswerJson: unknown | null
  questionType: string
  questionSchemaJson: unknown | null
  gradingPolicyJson: unknown | null
  defaultScore: string
  rubricJson: unknown | null
  orderNo: number | null
  rawPayloadJson: unknown
  createdAt: string
  updatedAt: string
}

type ImportSnapshot = {
  textbook: {
    id: string
    courseId: string
    externalId: string
    title: string
    subject: string
    publisher: string | null
    version: string
    sourceFileName: string
    rawPayloadJson: unknown
    createdAt: string
    updatedAt: string
  }
  chapters: Array<{
    id: string
    textbookId: string
    externalId: string
    parentId: string | null
    title: string
    orderNo: number
    rawPayloadJson: unknown
    createdAt: string
    updatedAt: string
  }>
  questionRows: ImportQuestionRow[]
  counts: {
    chapters: number
    questionRows: number
    leafQuestions: number
    groupQuestions: number
    childQuestions: number
  }
}

let questionBankPool: Pool | null = null

function assertQuestionBankSchemaName() {
  const schemaName = String(QUESTION_BANK_DB_SCHEMA || '').trim()
  if (!schemaName) {
    throw new Error('QUESTION_BANK_DB_SCHEMA 不能为空')
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
    throw new Error(`QUESTION_BANK_DB_SCHEMA 非法: ${schemaName}`)
  }
  if (schemaName.toLowerCase() === 'public') {
    throw new Error('QUESTION_BANK_DB_SCHEMA 不能是 public，请使用单独 schema')
  }
  return schemaName
}

function assertQuestionBankDatabaseConfig() {
  if (QUESTION_BANK_DATABASE_URL) return
  if (process.env.PGHOST || process.env.PGDATABASE || process.env.PGUSER) return
  throw new Error('缺少数据库连接配置，请设置 QUESTION_BANK_DATABASE_URL 或 PostgreSQL 标准环境变量')
}

function getQuestionBankPool() {
  assertQuestionBankDatabaseConfig()
  assertQuestionBankSchemaName()

  if (!questionBankPool) {
    questionBankPool = QUESTION_BANK_DATABASE_URL
      ? new Pool({ connectionString: QUESTION_BANK_DATABASE_URL })
      : new Pool()
  }

  return questionBankPool
}

export function getQuestionBankDbSchemaName() {
  return assertQuestionBankSchemaName()
}

export function getQuestionBankPoolInstance() {
  return getQuestionBankPool()
}

function quoteIdentifier(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function tableName(name: string) {
  return `${quoteIdentifier(assertQuestionBankSchemaName())}.${quoteIdentifier(name)}`
}

function normalizeJsonValue(value: unknown) {
  return value === undefined ? null : value
}

function toQuestionDescription(question: QuestionItem) {
  return question.nodeType === 'GROUP' ? question.stem.text : question.prompt.text
}

function sortChaptersForInsert(chapters: ChapterItem[]) {
  const byId = new Map(chapters.map((chapter) => [chapter.chapterId, chapter]))
  const result: ChapterItem[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const visit = (chapter: ChapterItem) => {
    if (visited.has(chapter.chapterId)) return
    if (visiting.has(chapter.chapterId)) {
      throw new Error(`章节存在循环父子关系: ${chapter.chapterId}`)
    }

    visiting.add(chapter.chapterId)
    if (chapter.parentId) {
      const parent = byId.get(chapter.parentId)
      if (!parent) {
        throw new Error(`章节缺少父节点: ${chapter.chapterId} -> ${chapter.parentId}`)
      }
      visit(parent)
    }
    visiting.delete(chapter.chapterId)
    visited.add(chapter.chapterId)
    result.push(chapter)
  }

  for (const chapter of chapters) {
    visit(chapter)
  }

  return result
}

function resolveFallbackChapterId(payload: TextbookJsonPayload) {
  if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
    return ''
  }
  const section = payload.chapters.find((item) => item.parentId !== null)
  if (section?.chapterId) return section.chapterId
  const first = payload.chapters[0]
  if (first?.chapterId) return first.chapterId
  throw new Error('题库 JSON 里存在 questions，但 chapters 为空')
}

function assertQuestionChapterExists(
  questionId: string,
  chapterExternalId: string,
  chapterDbIdMap: Map<string, string>,
) {
  const chapterId = chapterDbIdMap.get(chapterExternalId)
  if (!chapterId) {
    throw new Error(`题目 ${questionId} 关联的章节不存在: ${chapterExternalId}`)
  }
  return chapterId
}

function buildSnapshot(payload: TextbookJsonPayload, sourceFileName: string): ImportSnapshot {
  const timestamp = new Date().toISOString()
  const textbookId = crypto.randomUUID()
  const sortedChapters = sortChaptersForInsert(payload.chapters)
  const chapterIdMap = new Map<string, string>()

  const chapters = sortedChapters.map((chapter) => {
    const id = crypto.randomUUID()
    chapterIdMap.set(chapter.chapterId, id)
    return {
      id,
      textbookId,
      externalId: chapter.chapterId,
      parentId: null as string | null,
      title: chapter.title,
      orderNo: Number(chapter.orderNo) || 0,
      rawPayloadJson: chapter,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })

  for (const chapter of chapters) {
    const raw = payload.chapters.find((item) => item.chapterId === chapter.externalId)
    chapter.parentId = raw?.parentId ? chapterIdMap.get(raw.parentId) || null : null
  }

  const chapterTitleMap = new Map(payload.chapters.map((chapter) => [chapter.chapterId, chapter.title]))
  const fallbackChapterId = resolveFallbackChapterId(payload)
  const questionRows: ImportQuestionRow[] = []
  let leafQuestions = 0
  let groupQuestions = 0
  let childQuestions = 0

  for (const rawQuestion of payload.questions) {
    if (!rawQuestion || typeof rawQuestion !== 'object') {
      continue
    }

    const rawRecord = rawQuestion as Record<string, unknown>
    const rawChapterId =
      typeof rawRecord.chapterId === 'string' && rawRecord.chapterId.trim()
        ? rawRecord.chapterId.trim()
        : fallbackChapterId
    const fallbackSectionTitle = chapterTitleMap.get(rawChapterId) || ''
    const normalized = normalizeQuestionItem(rawQuestion, rawChapterId, fallbackSectionTitle)
    if (!normalized) {
      continue
    }

    const chapterId = assertQuestionChapterExists(normalized.questionId, normalized.chapterId, chapterIdMap)
    const groupQuestionId = crypto.randomUUID()

    if (normalized.nodeType === 'GROUP') {
      groupQuestions += 1
      questionRows.push({
        id: groupQuestionId,
        textbookId,
        courseId: payload.courseId,
        externalId: normalized.questionId,
        chapterId,
        nodeType: 'GROUP',
        parentId: null,
        title: normalized.title,
        description: toQuestionDescription(normalized),
        stemJson: normalized.stem,
        promptJson: null,
        standardAnswerJson: null,
        questionType: normalized.questionType,
        questionSchemaJson: normalizeJsonValue(rawRecord.questionSchema),
        gradingPolicyJson: normalizeJsonValue(rawRecord.gradingPolicy),
        defaultScore: '0.00',
        rubricJson: null,
        orderNo:
          rawRecord.orderNo !== undefined && Number.isFinite(Number(rawRecord.orderNo))
            ? Number(rawRecord.orderNo)
            : null,
        rawPayloadJson: rawQuestion,
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      const rawChildren = Array.isArray(rawRecord.children) ? rawRecord.children : []
      normalized.children.forEach((child, index) => {
        const rawChild =
          rawChildren[index] && typeof rawChildren[index] === 'object'
            ? (rawChildren[index] as Record<string, unknown>)
            : {}

        childQuestions += 1
        questionRows.push({
          id: crypto.randomUUID(),
          textbookId,
          courseId: payload.courseId,
          externalId: child.questionId,
          chapterId,
          nodeType: 'LEAF',
          parentId: groupQuestionId,
          title: child.title,
          description: child.prompt.text,
          stemJson: null,
          promptJson: child.prompt,
          standardAnswerJson: child.standardAnswer,
          questionType: child.questionType,
          questionSchemaJson: normalizeJsonValue(rawChild.questionSchema),
          gradingPolicyJson: normalizeJsonValue(rawChild.gradingPolicy),
          defaultScore: Number(child.defaultScore || 0).toFixed(2),
          rubricJson: normalizeJsonValue(child.rubric),
          orderNo: Number(child.orderNo) || index + 1,
          rawPayloadJson: rawChild,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      })
      continue
    }

    leafQuestions += 1
    questionRows.push({
      id: crypto.randomUUID(),
      textbookId,
      courseId: payload.courseId,
      externalId: normalized.questionId,
      chapterId,
      nodeType: 'LEAF',
      parentId: null,
      title: normalized.title,
      description: normalized.prompt.text,
      stemJson: null,
      promptJson: normalized.prompt,
      standardAnswerJson: normalized.standardAnswer,
      questionType: normalized.questionType,
      questionSchemaJson: normalizeJsonValue(rawRecord.questionSchema),
      gradingPolicyJson: normalizeJsonValue(rawRecord.gradingPolicy),
      defaultScore: Number(normalized.defaultScore || 0).toFixed(2),
      rubricJson: normalizeJsonValue(normalized.rubric),
      orderNo:
        rawRecord.orderNo !== undefined && Number.isFinite(Number(rawRecord.orderNo))
          ? Number(rawRecord.orderNo)
          : null,
      rawPayloadJson: rawQuestion,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  return {
    textbook: {
      id: textbookId,
      courseId: payload.courseId,
      externalId: payload.textbook.textbookId,
      title: payload.textbook.title,
      subject: payload.textbook.subject,
      publisher: payload.textbook.publisher || null,
      version: payload.version,
      sourceFileName,
      rawPayloadJson: payload.textbook,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    chapters,
    questionRows,
    counts: {
      chapters: chapters.length,
      questionRows: questionRows.length,
      leafQuestions,
      groupQuestions,
      childQuestions,
    },
  }
}

async function ensureMigrationTable(client: PoolClient) {
  const schemaName = assertQuestionBankSchemaName()
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`)
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName('__migrations')} (
      id varchar(32) PRIMARY KEY,
      description text NOT NULL,
      executed_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function getAppliedMigrationIds(client: PoolClient) {
  await ensureMigrationTable(client)
  const result = await client.query<{ id: string }>(`SELECT id FROM ${tableName('__migrations')} ORDER BY id ASC`)
  return new Set(result.rows.map((row) => row.id))
}

async function assertQuestionBankSchemaReady(client: PoolClient) {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      ) AS "exists"
    `,
    [assertQuestionBankSchemaName(), '__migrations'],
  )

  if (!result.rows[0]?.exists) {
    throw new Error('题库数据库 schema 尚未迁移，请先在终端执行 npm run db:migrate')
  }

  const appliedIds = await getAppliedMigrationIds(client)
  const pending = questionBankMigrations.filter((migration) => !appliedIds.has(migration.id))
  if (pending.length) {
    throw new Error(
      `题库数据库存在未执行迁移，请先执行 npm run db:migrate。待执行: ${pending.map((item) => item.id).join(', ')}`,
    )
  }
}

export async function migrateQuestionBankSchema() {
  const pool = getQuestionBankPool()
  const client = await pool.connect()

  try {
    await ensureMigrationTable(client)
    const appliedIds = await getAppliedMigrationIds(client)
    const executed: string[] = []

    for (const migration of questionBankMigrations) {
      if (appliedIds.has(migration.id)) {
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(migration.up(assertQuestionBankSchemaName()))
        await client.query(
          `INSERT INTO ${tableName('__migrations')} (id, description, executed_at) VALUES ($1, $2, now())`,
          [migration.id, migration.description],
        )
        await client.query('COMMIT')
        executed.push(migration.id)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }

    const appliedAfter = await getAppliedMigrationIds(client)
    return {
      schema: assertQuestionBankSchemaName(),
      executed,
      applied: Array.from(appliedAfter).sort(),
    }
  } finally {
    client.release()
  }
}

function parseUploadedPayload(source: UploadedJsonSource) {
  let parsed: unknown
  try {
    parsed = JSON.parse(source.text)
  } catch {
    throw new Error(`${source.fileName} 不是合法 JSON`)
  }

  if (!isValidTextbookPayload(parsed)) {
    throw new Error(`${source.fileName} 不是支持的题库 JSON 结构`)
  }

  return parsed as TextbookJsonPayload
}

async function upsertImportSnapshot(client: PoolClient, snapshot: ImportSnapshot) {
  const textbookTable = tableName('textbooks')
  const chaptersTable = tableName('chapters')
  const questionsTable = tableName('question_bank_questions')
  const importRunsTable = tableName('question_bank_import_runs')

  const existing = await client.query<{ id: string; createdAt: string }>(
    `
      SELECT id, created_at AS "createdAt"
      FROM ${textbookTable}
      WHERE course_id = $1 AND external_id = $2
      LIMIT 1
    `,
    [snapshot.textbook.courseId, snapshot.textbook.externalId],
  )

  const textbookId = existing.rows[0]?.id || snapshot.textbook.id
  const createdAt = existing.rows[0]?.createdAt || snapshot.textbook.createdAt

  await client.query(
    `
      INSERT INTO ${textbookTable} (
        id,
        course_id,
        external_id,
        title,
        subject,
        publisher,
        version,
        source_file_name,
        raw_payload_json,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz, $11::timestamptz
      )
      ON CONFLICT (course_id, external_id) DO UPDATE SET
        title = EXCLUDED.title,
        subject = EXCLUDED.subject,
        publisher = EXCLUDED.publisher,
        version = EXCLUDED.version,
        source_file_name = EXCLUDED.source_file_name,
        raw_payload_json = EXCLUDED.raw_payload_json,
        updated_at = EXCLUDED.updated_at
    `,
    [
      textbookId,
      snapshot.textbook.courseId,
      snapshot.textbook.externalId,
      snapshot.textbook.title,
      snapshot.textbook.subject,
      snapshot.textbook.publisher,
      snapshot.textbook.version,
      snapshot.textbook.sourceFileName,
      JSON.stringify(snapshot.textbook.rawPayloadJson),
      createdAt,
      snapshot.textbook.updatedAt,
    ],
  )

  await client.query(`DELETE FROM ${questionsTable} WHERE textbook_id = $1`, [textbookId])
  await client.query(`DELETE FROM ${chaptersTable} WHERE textbook_id = $1`, [textbookId])

  const chapterIdRemap = new Map<string, string>()
  for (const chapter of snapshot.chapters) {
    chapterIdRemap.set(chapter.id, crypto.randomUUID())
  }

  for (const chapter of snapshot.chapters) {
    await client.query(
      `
        INSERT INTO ${chaptersTable} (
          id,
          textbook_id,
          external_id,
          parent_id,
          title,
          order_no,
          raw_payload_json,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz
        )
      `,
      [
        chapterIdRemap.get(chapter.id),
        textbookId,
        chapter.externalId,
        chapter.parentId ? chapterIdRemap.get(chapter.parentId) || null : null,
        chapter.title,
        chapter.orderNo,
        JSON.stringify(chapter.rawPayloadJson),
        createdAt,
        snapshot.textbook.updatedAt,
      ],
    )
  }

  const questionIdRemap = new Map<string, string>()
  for (const question of snapshot.questionRows) {
    questionIdRemap.set(question.id, crypto.randomUUID())
  }

  for (const question of snapshot.questionRows) {
    await client.query(
      `
        INSERT INTO ${questionsTable} (
          id,
          textbook_id,
          course_id,
          external_id,
          chapter_id,
          node_type,
          parent_id,
          title,
          description,
          stem_json,
          prompt_json,
          standard_answer_json,
          question_type,
          question_schema_json,
          grading_policy_json,
          default_score,
          rubric_json,
          order_no,
          raw_payload_json,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb, $15::jsonb, $16::numeric,
          $17::jsonb, $18, $19::jsonb, $20::timestamptz, $21::timestamptz
        )
      `,
      [
        questionIdRemap.get(question.id),
        textbookId,
        question.courseId,
        question.externalId,
        question.chapterId ? chapterIdRemap.get(question.chapterId) || null : null,
        question.nodeType,
        question.parentId ? questionIdRemap.get(question.parentId) || null : null,
        question.title,
        question.description,
        question.stemJson === null ? null : JSON.stringify(question.stemJson),
        question.promptJson === null ? null : JSON.stringify(question.promptJson),
        question.standardAnswerJson === null ? null : JSON.stringify(question.standardAnswerJson),
        question.questionType,
        question.questionSchemaJson === null ? null : JSON.stringify(question.questionSchemaJson),
        question.gradingPolicyJson === null ? null : JSON.stringify(question.gradingPolicyJson),
        question.defaultScore,
        question.rubricJson === null ? null : JSON.stringify(question.rubricJson),
        question.orderNo,
        JSON.stringify(question.rawPayloadJson),
        createdAt,
        snapshot.textbook.updatedAt,
      ],
    )
  }

  await client.query(
    `
      INSERT INTO ${importRunsTable} (
        id,
        textbook_id,
        source_file_name,
        imported_at,
        chapter_count,
        question_row_count,
        leaf_question_count,
        group_question_count,
        child_question_count
      ) VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8)
    `,
    [
      crypto.randomUUID(),
      textbookId,
      snapshot.textbook.sourceFileName,
      snapshot.counts.chapters,
      snapshot.counts.questionRows,
      snapshot.counts.leafQuestions,
      snapshot.counts.groupQuestions,
      snapshot.counts.childQuestions,
    ],
  )

  return {
    textbookId: snapshot.textbook.externalId,
    title: snapshot.textbook.title,
    courseId: snapshot.textbook.courseId,
    chapters: snapshot.counts.chapters,
    questionRows: snapshot.counts.questionRows,
    leafQuestions: snapshot.counts.leafQuestions,
    groupQuestions: snapshot.counts.groupQuestions,
    childQuestions: snapshot.counts.childQuestions,
  }
}

export async function importQuestionBankJsonUploads(files: UploadedJsonSource[]) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('请至少上传一个 JSON 文件')
  }

  const pool = getQuestionBankPool()
  const client = await pool.connect()

  try {
    await assertQuestionBankSchemaReady(client)
    const items: Array<{
      fileName: string
      textbookId: string
      title: string
      courseId: string
      chapters: number
      questionRows: number
      leafQuestions: number
      groupQuestions: number
      childQuestions: number
    }> = []

    for (const file of files) {
      const payload = parseUploadedPayload(file)
      const snapshot = buildSnapshot(payload, file.fileName)
      await client.query('BEGIN')
      try {
        const imported = await upsertImportSnapshot(client, snapshot)
        await client.query('COMMIT')
        items.push({
          fileName: file.fileName,
          ...imported,
        })
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }

    return {
      schema: assertQuestionBankSchemaName(),
      fileCount: items.length,
      items,
    }
  } finally {
    client.release()
  }
}

export async function getQuestionBankDatabaseSummary() {
  const pool = getQuestionBankPool()
  const client = await pool.connect()

  try {
    await assertQuestionBankSchemaReady(client)
    const databaseMeta = await client.query<{ databaseName: string }>(
      `SELECT current_database() AS "databaseName"`,
    )

    const counts = await client.query<{
      textbookCount: string
      chapterCount: string
      questionRowCount: string
      groupQuestionCount: string
      leafQuestionCount: string
      childQuestionCount: string
    }>(
      `
        SELECT
          (SELECT COUNT(*)::text FROM ${tableName('textbooks')}) AS "textbookCount",
          (SELECT COUNT(*)::text FROM ${tableName('chapters')}) AS "chapterCount",
          (SELECT COUNT(*)::text FROM ${tableName('question_bank_questions')}) AS "questionRowCount",
          (SELECT COUNT(*)::text FROM ${tableName('question_bank_questions')} WHERE node_type = 'GROUP') AS "groupQuestionCount",
          (SELECT COUNT(*)::text FROM ${tableName('question_bank_questions')} WHERE node_type = 'LEAF' AND parent_id IS NULL) AS "leafQuestionCount",
          (SELECT COUNT(*)::text FROM ${tableName('question_bank_questions')} WHERE parent_id IS NOT NULL) AS "childQuestionCount"
      `,
    )

    const textbooks = await client.query<{
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
        GROUP BY t.id
        ORDER BY t.updated_at DESC, t.title ASC
      `,
    )

    return {
      schema: assertQuestionBankSchemaName(),
      database: String(databaseMeta.rows[0]?.databaseName || ''),
      counts: {
        textbookCount: Number(counts.rows[0]?.textbookCount || 0),
        chapterCount: Number(counts.rows[0]?.chapterCount || 0),
        questionRowCount: Number(counts.rows[0]?.questionRowCount || 0),
        groupQuestionCount: Number(counts.rows[0]?.groupQuestionCount || 0),
        leafQuestionCount: Number(counts.rows[0]?.leafQuestionCount || 0),
        childQuestionCount: Number(counts.rows[0]?.childQuestionCount || 0),
      },
      textbooks: textbooks.rows.map((row) => ({
        ...row,
        chapters: Number(row.chapters || 0),
        questionRows: Number(row.questionRows || 0),
        groupQuestions: Number(row.groupQuestions || 0),
        leafQuestions: Number(row.leafQuestions || 0),
        childQuestions: Number(row.childQuestions || 0),
      })),
    }
  } finally {
    client.release()
  }
}
