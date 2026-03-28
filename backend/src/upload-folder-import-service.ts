import fsp from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR } from './config'
import { isObject } from './question-json-target'
import { loadTextbookJson, saveTextbookJson } from './question-bank-service'
import type { QuestionItem, TextbookJsonPayload } from './types'

type UploadFolderFile = {
  originalname: string
  buffer: Buffer
  relativePath?: string
}

type UploadRewriteSummary = {
  importedCount: number
  rewrittenCount: number
  matchedCount: number
  uploadedFiles: Array<{
    relativePath: string
    publicUrl: string
  }>
}

function normalizeSlashes(value: string) {
  return String(value || '').replace(/\\/g, '/')
}

function sanitizeUploadRelativePath(rawPath: string, fallbackName: string) {
  const trimmed = normalizeSlashes(rawPath).replace(/^\/+/, '').trim()
  const withoutUploadsPrefix = trimmed.replace(/^uploads\//i, '')
  const normalized = path.posix.normalize(withoutUploadsPrefix || normalizeSlashes(fallbackName))
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Invalid upload relative path: ${rawPath || fallbackName}`)
  }
  return normalized
}

function toPublicUploadUrl(relativePath: string) {
  return `/uploads/${normalizeSlashes(relativePath).replace(/^\/+/, '')}`
}

function extractUploadRelativePathFromUrl(rawUrl: string) {
  const clean = normalizeSlashes(String(rawUrl || '').trim().split('?')[0])
  if (!clean) {
    return ''
  }
  if (clean.startsWith('/uploads/')) {
    return clean.replace(/^\/uploads\//, '')
  }
  if (clean.startsWith('uploads/')) {
    return clean.replace(/^uploads\//, '')
  }
  const uploadsMatch = clean.match(/(?:^|\/)uploads\/(.+)$/i)
  if (uploadsMatch?.[1]) {
    return uploadsMatch[1]
  }
  const questionMediaMatch = clean.match(/(?:^|\/)(question_media\/.+)$/i)
  if (questionMediaMatch?.[1]) {
    return questionMediaMatch[1]
  }
  return ''
}

function collectTextBlocks(question: QuestionItem) {
  const blocks: Array<Record<string, unknown>> = []
  if (question.nodeType === 'GROUP') {
    if (isObject(question.stem)) {
      blocks.push(question.stem as Record<string, unknown>)
    }
    for (const child of Array.isArray(question.children) ? question.children : []) {
      if (isObject(child.prompt)) {
        blocks.push(child.prompt as Record<string, unknown>)
      }
      if (isObject(child.standardAnswer)) {
        blocks.push(child.standardAnswer as Record<string, unknown>)
      }
    }
    return blocks
  }

  if (isObject(question.prompt)) {
    blocks.push(question.prompt as Record<string, unknown>)
  }
  if (isObject(question.standardAnswer)) {
    blocks.push(question.standardAnswer as Record<string, unknown>)
  }
  return blocks
}

function rewritePayloadMediaUrls(params: {
  payload: TextbookJsonPayload
  relativePathMap: Map<string, string>
  baseNameMap: Map<string, string>
}) {
  const { payload, relativePathMap, baseNameMap } = params
  let rewrittenCount = 0
  let matchedCount = 0

  const questions = (Array.isArray(payload.questions) ? payload.questions : []).filter(isObject) as QuestionItem[]
  for (const question of questions) {
    for (const block of collectTextBlocks(question)) {
      const mediaItems = Array.isArray(block.media) ? block.media.filter(isObject) : []
      for (const item of mediaItems) {
        const currentUrl = String(item.url || '').trim()
        const relativePath = extractUploadRelativePathFromUrl(currentUrl)
        const byRelativePath = relativePath ? relativePathMap.get(relativePath.toLowerCase()) : ''
        const byBaseName = currentUrl ? baseNameMap.get(path.posix.basename(normalizeSlashes(currentUrl)).toLowerCase()) : ''
        const nextUrl = byRelativePath || byBaseName || ''
        if (!nextUrl) {
          continue
        }
        matchedCount += 1
        if (currentUrl !== nextUrl) {
          item.url = nextUrl
          rewrittenCount += 1
        }
      }
    }
  }

  return {
    rewrittenCount,
    matchedCount,
  }
}

export async function importUploadsFolderIntoServer(params: {
  files: UploadFolderFile[]
  jsonFilePath?: string
}) {
  const { files, jsonFilePath = '' } = params
  if (!Array.isArray(files) || !files.length) {
    throw new Error('at least one upload file is required')
  }

  await fsp.mkdir(UPLOAD_DIR, { recursive: true })

  const uploadedFiles: UploadRewriteSummary['uploadedFiles'] = []
  const relativePathMap = new Map<string, string>()
  const baseNameMap = new Map<string, string>()
  const basenameCounts = new Map<string, number>()

  for (const file of files) {
    const relativePath = sanitizeUploadRelativePath(file.relativePath || file.originalname, file.originalname)
    const destination = path.resolve(UPLOAD_DIR, relativePath)
    const uploadRoot = path.resolve(UPLOAD_DIR)
    if (!destination.startsWith(uploadRoot)) {
      throw new Error(`Upload target escapes uploads directory: ${relativePath}`)
    }

    await fsp.mkdir(path.dirname(destination), { recursive: true })
    await fsp.writeFile(destination, file.buffer)

    const publicUrl = toPublicUploadUrl(relativePath)
    uploadedFiles.push({
      relativePath,
      publicUrl,
    })
    relativePathMap.set(relativePath.toLowerCase(), publicUrl)

    const baseName = path.posix.basename(relativePath).toLowerCase()
    basenameCounts.set(baseName, (basenameCounts.get(baseName) || 0) + 1)
    baseNameMap.set(baseName, publicUrl)
  }

  for (const [baseName, count] of basenameCounts.entries()) {
    if (count > 1) {
      baseNameMap.delete(baseName)
    }
  }

  let rewrittenCount = 0
  let matchedCount = 0
  if (jsonFilePath) {
    const payload = await loadTextbookJson(jsonFilePath)
    const summary = rewritePayloadMediaUrls({
      payload,
      relativePathMap,
      baseNameMap,
    })
    rewrittenCount = summary.rewrittenCount
    matchedCount = summary.matchedCount
    if (rewrittenCount > 0) {
      await saveTextbookJson(jsonFilePath, payload)
    }
  }

  return {
    importedCount: uploadedFiles.length,
    rewrittenCount,
    matchedCount,
    uploadedFiles,
  } satisfies UploadRewriteSummary
}
