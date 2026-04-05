import fsp from 'node:fs/promises'
import path from 'node:path'
import { MERGED_JSON_DIR } from './config'
import {
  batchId,
  getPayloadSourceMeta,
  isValidTextbookPayload,
  normalizeJsonFileName,
} from './question-bank-service'
import type { ChapterItem, TextbookJsonPayload } from './types'
import { writeWorkspaceJsonAsset } from './workspace-store'

function chapterIdentity(item: ChapterItem) {
  return JSON.stringify({
    chapterId: item.chapterId,
    parentId: item.parentId,
    title: item.title,
    orderNo: item.orderNo,
  })
}

function stableJson(value: unknown) {
  return JSON.stringify(value)
}

function ensureCompatibleBase(base: TextbookJsonPayload, current: TextbookJsonPayload, fileName: string) {
  const baseMeta = getPayloadSourceMeta(base)
  const currentMeta = getPayloadSourceMeta(current)
  if (base.courseId !== current.courseId) {
    throw new Error(`文件 ${fileName} 的 courseId 与第一个文件不一致`)
  }
  if (baseMeta.documentType !== currentMeta.documentType) {
    throw new Error(`文件 ${fileName} 的 documentType 与第一个文件不一致`)
  }
  if (baseMeta.externalId !== currentMeta.externalId) {
    throw new Error(`文件 ${fileName} 的 externalId 与第一个文件不一致`)
  }
  if (baseMeta.hasAnswer !== currentMeta.hasAnswer) {
    throw new Error(`文件 ${fileName} 的 hasAnswer 与第一个文件不一致`)
  }
}

function mergeChapters(target: ChapterItem[], incoming: ChapterItem[], fileName: string) {
  const byId = new Map(target.map((item) => [item.chapterId, item]))
  let duplicateCount = 0

  for (const chapter of incoming) {
    const existing = byId.get(chapter.chapterId)
    if (!existing) {
      target.push(chapter)
      byId.set(chapter.chapterId, chapter)
      continue
    }
    if (chapterIdentity(existing) !== chapterIdentity(chapter)) {
      throw new Error(`文件 ${fileName} 中 chapterId=${chapter.chapterId} 与已有章节定义冲突`)
    }
    duplicateCount += 1
  }

  return duplicateCount
}

function mergeQuestions(target: unknown[], incoming: unknown[], fileName: string) {
  const byId = new Map<string, unknown>()
  for (const item of target) {
    const row = item as Record<string, unknown>
    const questionId = typeof row.questionId === 'string' ? row.questionId.trim() : ''
    if (questionId) {
      byId.set(questionId, item)
    }
  }

  let duplicateCount = 0
  for (const item of incoming) {
    const row = item as Record<string, unknown>
    const questionId = typeof row.questionId === 'string' ? row.questionId.trim() : ''
    if (!questionId) {
      target.push(item)
      continue
    }

    const existing = byId.get(questionId)
    if (!existing) {
      target.push(item)
      byId.set(questionId, item)
      continue
    }

    if (stableJson(existing) !== stableJson(item)) {
      throw new Error(`文件 ${fileName} 中 questionId=${questionId} 与已有题目内容冲突`)
    }
    duplicateCount += 1
  }

  return duplicateCount
}

function parseNumericTokens(value: string, prefix: string) {
  const normalized = String(value || '').trim()
  const body = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
  return body
    .split('_')
    .map((token) => Number(token))
    .filter((token) => Number.isFinite(token))
}

function extractQuestionSortTokens(item: unknown) {
  const row = item as Record<string, unknown>
  const questionId = typeof row.questionId === 'string' ? row.questionId.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''

  if (questionId) {
    return parseNumericTokens(questionId, 'q_')
  }

  const matches = [...title.matchAll(/(\d+)/g)].map((match) => Number(match[1]))
  return matches.filter((token) => Number.isFinite(token))
}

function compareNumericTokenLists(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? -1
    const right = b[index] ?? -1
    if (left !== right) {
      return left - right
    }
  }
  return 0
}

function compareChapterItems(a: ChapterItem, b: ChapterItem) {
  const orderA = Number(a.orderNo || 0)
  const orderB = Number(b.orderNo || 0)
  if (orderA !== orderB) {
    return orderA - orderB
  }

  const idCompare = compareNumericTokenLists(
    parseNumericTokens(a.chapterId, 'ch_'),
    parseNumericTokens(b.chapterId, 'ch_'),
  )
  if (idCompare !== 0) {
    return idCompare
  }

  if (a.title !== b.title) {
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN', { numeric: true, sensitivity: 'base' })
  }

  return a.chapterId.localeCompare(b.chapterId, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function sortMergedChapters(chapters: ChapterItem[]) {
  const byParent = new Map<string | null, ChapterItem[]>()
  for (const chapter of chapters) {
    const key = chapter.parentId || null
    const bucket = byParent.get(key) || []
    bucket.push(chapter)
    byParent.set(key, bucket)
  }

  for (const bucket of byParent.values()) {
    bucket.sort(compareChapterItems)
  }

  const ordered: ChapterItem[] = []
  const visited = new Set<string>()

  const walk = (parentId: string | null) => {
    const children = byParent.get(parentId) || []
    for (const chapter of children) {
      if (visited.has(chapter.chapterId)) continue
      visited.add(chapter.chapterId)
      ordered.push(chapter)
      walk(chapter.chapterId)
    }
  }

  walk(null)

  const remaining = chapters.filter((chapter) => !visited.has(chapter.chapterId)).sort(compareChapterItems)
  ordered.push(...remaining)

  chapters.splice(0, chapters.length, ...ordered)
}

function sortMergedQuestions(questions: unknown[]) {
  questions.sort((a, b) => {
    const rowA = a as Record<string, unknown>
    const rowB = b as Record<string, unknown>
    const chapterIdA = typeof rowA.chapterId === 'string' ? rowA.chapterId.trim() : ''
    const chapterIdB = typeof rowB.chapterId === 'string' ? rowB.chapterId.trim() : ''
    const chapterCompare = compareNumericTokenLists(
      parseNumericTokens(chapterIdA, 'ch_'),
      parseNumericTokens(chapterIdB, 'ch_'),
    )
    if (chapterCompare !== 0) {
      return chapterCompare
    }

    const questionCompare = compareNumericTokenLists(
      extractQuestionSortTokens(a),
      extractQuestionSortTokens(b),
    )
    if (questionCompare !== 0) {
      return questionCompare
    }

    const questionIdA = typeof rowA.questionId === 'string' ? rowA.questionId.trim() : ''
    const questionIdB = typeof rowB.questionId === 'string' ? rowB.questionId.trim() : ''
    if (questionIdA !== questionIdB) {
      return questionIdA.localeCompare(questionIdB, 'zh-CN', { numeric: true, sensitivity: 'base' })
    }

    const titleA = typeof rowA.title === 'string' ? rowA.title.trim() : ''
    const titleB = typeof rowB.title === 'string' ? rowB.title.trim() : ''
    return titleA.localeCompare(titleB, 'zh-CN', { numeric: true, sensitivity: 'base' })
  })
}

function buildMergedFileName(preferredName: string, sourceNames: string[]) {
  const preferred = String(preferredName || '').trim()
  if (preferred) {
    return normalizeJsonFileName(preferred)
  }
  const firstSource = sourceNames[0] || `merged_${batchId()}.json`
  const stem = path.basename(firstSource, path.extname(firstSource))
  return normalizeJsonFileName(`${stem}_merged.json`)
}

function parseTextbookJsonFiles(files: Array<{ fileName: string; text: string }>) {
  return files.map(({ fileName, text }) => {
    const parsed = JSON.parse(text) as unknown
    if (!isValidTextbookPayload(parsed)) {
      throw new Error(`文件 ${fileName} 不是有效的题库 JSON`)
    }
    return {
      fileName,
      payload: parsed as TextbookJsonPayload,
    }
  })
}

function buildMergedPayload(parsedFiles: Array<{ fileName: string; payload: TextbookJsonPayload }>) {
  const base = parsedFiles[0].payload
  const baseMeta = getPayloadSourceMeta(base)
  const merged: TextbookJsonPayload = {
    version: base.version,
    courseId: base.courseId,
    documentType: baseMeta.documentType,
    ...(base.textbook ? { textbook: { ...base.textbook } } : {}),
    ...(base.exam ? { exam: { ...base.exam } } : {}),
    chapters: [...base.chapters],
    questions: Array.isArray(base.questions) ? [...base.questions] : [],
  }

  let duplicateChapterCount = 0
  let duplicateQuestionCount = 0

  for (let index = 1; index < parsedFiles.length; index += 1) {
    const current = parsedFiles[index]
    ensureCompatibleBase(base, current.payload, current.fileName)
    duplicateChapterCount += mergeChapters(merged.chapters, current.payload.chapters, current.fileName)
    duplicateQuestionCount += mergeQuestions(merged.questions, current.payload.questions, current.fileName)
  }

  sortMergedChapters(merged.chapters)
  sortMergedQuestions(merged.questions)

  return {
    merged,
    duplicateChapterCount,
    duplicateQuestionCount,
  }
}

export async function mergeTextbookJsonFiles(params: {
  files: Array<{ fileName: string; text: string }>
  outputFileName?: string
  workspaceId?: string
}) {
  const { files, outputFileName = '', workspaceId = '' } = params
  if (!Array.isArray(files) || files.length < 2) {
    throw new Error('至少需要选择 2 个 JSON 文件')
  }

  const parsedFiles = parseTextbookJsonFiles(files)
  const { merged, duplicateChapterCount, duplicateQuestionCount } = buildMergedPayload(parsedFiles)
  const mergedText = `${JSON.stringify(merged, null, 2)}\n`

  await fsp.mkdir(MERGED_JSON_DIR, { recursive: true })
  const mergedFileName = buildMergedFileName(outputFileName, parsedFiles.map((item) => item.fileName))
  const mergedFilePath = path.join(MERGED_JSON_DIR, mergedFileName)
  await fsp.writeFile(mergedFilePath, mergedText, { encoding: 'utf8' })

  const normalizedWorkspaceId = String(workspaceId || '').trim()
  let persistedToWorkspace = false
  let persistedWorkspaceId = ''
  let jsonAssetId = ''
  let workspaceFilePath = ''

  if (normalizedWorkspaceId) {
    const saved = await writeWorkspaceJsonAsset({
      workspaceId: normalizedWorkspaceId,
      fileName: mergedFileName,
      text: mergedText,
    })
    persistedToWorkspace = true
    persistedWorkspaceId = saved.workspaceId
    jsonAssetId = saved.asset.assetId
    workspaceFilePath = saved.filePath
  }

  return {
    message: 'success',
    mergedFileName,
    mergedFilePath,
    inputCount: parsedFiles.length,
    chaptersCount: merged.chapters.length,
    questionsCount: merged.questions.length,
    duplicateChapterCount,
    duplicateQuestionCount,
    persistedToWorkspace,
    workspaceId: persistedWorkspaceId,
    jsonAssetId,
    workspaceFilePath,
  }
}
