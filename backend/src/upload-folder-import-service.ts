import fsp from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR } from './config'
import { isObject } from './question-json-target'
import { loadTextbookJson, saveTextbookJson } from './question-bank-service'
import type { QuestionItem, TextbookJsonPayload } from './types'
import { readUploadedFileBuffer } from './upload'
import { ensureWorkspace, getWorkspaceDir } from './workspace-store'

type UploadFolderFile = {
  originalname: string
  buffer?: Buffer
  path?: string
  relativePath?: string
}

type UploadRewriteSummary = {
  importedCount: number
  rewrittenCount: number
  matchedCount: number
  sourceMode?: 'local_upload' | 'workspace_folder'
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

function buildRelativePathCandidates(relativePath: string) {
  const normalized = normalizeSlashes(relativePath).replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  const candidates = [normalized]
  if (parts.length > 1) {
    candidates.push(parts.slice(1).join('/'))
  }
  return [...new Set(candidates.filter(Boolean).map((item) => item.toLowerCase()))]
}

function sanitizeWorkspaceRelativePath(rawPath: string) {
  const trimmed = normalizeSlashes(rawPath).replace(/^\/+/, '').trim()
  const normalized = path.posix.normalize(trimmed)
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Invalid workspace relative path: ${rawPath}`)
  }
  return normalized
}

function toPublicUploadUrl(relativePath: string) {
  return `/uploads/${normalizeSlashes(relativePath).replace(/^\/+/, '')}`
}

function toWorkspaceUploadUrl(workspaceId: string, relativePath: string) {
  return `/workspace-assets/${workspaceId}/uploads/source_uploads/${normalizeSlashes(relativePath).replace(/^\/+/, '')}`
}

function toWorkspaceAssetUrl(workspaceId: string, relativePath: string) {
  return `/workspace-assets/${workspaceId}/${normalizeSlashes(relativePath).replace(/^\/+/, '')}`
}

async function collectWorkspaceFolderFiles(params: {
  workspaceId: string
  workspaceSourceRelativePath: string
}) {
  const { workspaceId, workspaceSourceRelativePath } = params
  const normalizedRoot = sanitizeWorkspaceRelativePath(workspaceSourceRelativePath)
  const workspaceRoot = path.resolve(getWorkspaceDir(workspaceId))
  const sourceRoot = path.resolve(workspaceRoot, normalizedRoot)
  if (!sourceRoot.startsWith(workspaceRoot)) {
    throw new Error(`Workspace source path escapes workspace root: ${workspaceSourceRelativePath}`)
  }
  const stat = await fsp.stat(sourceRoot).catch(() => null)
  if (!stat) {
    throw new Error(`Workspace source path not found: ${workspaceSourceRelativePath}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Workspace source path is not a directory: ${workspaceSourceRelativePath}`)
  }

  const uploadedFiles: UploadRewriteSummary['uploadedFiles'] = []
  const relativePathMap = new Map<string, string>()
  const baseNameMap = new Map<string, string>()
  const basenameCounts = new Map<string, number>()

  async function walk(currentAbsolutePath: string, currentRelativePath = '') {
    const entries = await fsp.readdir(currentAbsolutePath, { withFileTypes: true })
    for (const entry of entries) {
      const nextRelativePath = currentRelativePath
        ? path.posix.join(currentRelativePath, entry.name)
        : entry.name
      const nextAbsolutePath = path.join(currentAbsolutePath, entry.name)
      if (entry.isDirectory()) {
        await walk(nextAbsolutePath, nextRelativePath)
        continue
      }
      if (!entry.isFile()) {
        continue
      }

      const workspaceRelativePath = normalizeSlashes(path.posix.join(normalizedRoot, nextRelativePath))
      const publicUrl = toWorkspaceAssetUrl(workspaceId, workspaceRelativePath)
      uploadedFiles.push({
        relativePath: workspaceRelativePath,
        publicUrl,
      })

      const candidateSeeds = [workspaceRelativePath, nextRelativePath]
      for (const seed of candidateSeeds) {
        for (const candidate of buildRelativePathCandidates(seed)) {
          relativePathMap.set(candidate, publicUrl)
        }
      }

      const baseName = path.posix.basename(nextRelativePath).toLowerCase()
      basenameCounts.set(baseName, (basenameCounts.get(baseName) || 0) + 1)
      baseNameMap.set(baseName, publicUrl)
    }
  }

  await walk(sourceRoot)

  for (const [baseName, count] of basenameCounts.entries()) {
    if (count > 1) {
      baseNameMap.delete(baseName)
    }
  }

  return {
    uploadedFiles,
    relativePathMap,
    baseNameMap,
  }
}

function extractUploadRelativePathFromUrl(rawUrl: string) {
  const clean = normalizeSlashes(String(rawUrl || '').trim().split('?')[0])
  if (!clean) {
    return ''
  }
  const pseudoHttpsMatch = clean.match(/^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i)
  if (pseudoHttpsMatch?.[1] && /\.[a-z0-9]{2,8}$/i.test(pseudoHttpsMatch[1])) {
    return pseudoHttpsMatch[1]
  }
  if (clean.startsWith('/uploads/')) {
    return clean.replace(/^\/uploads\//, '')
  }
  if (clean.startsWith('uploads/')) {
    return clean.replace(/^uploads\//, '')
  }
  const workspaceUploadsMatch = clean.match(/^\/workspace-assets\/[^/]+\/uploads\/source_uploads\/(.+)$/i)
  if (workspaceUploadsMatch?.[1]) {
    return workspaceUploadsMatch[1]
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

function extractMediaBaseName(rawUrl: string) {
  const clean = normalizeSlashes(String(rawUrl || '').trim().split('?')[0])
  if (!clean) {
    return ''
  }
  const pseudoHttpsMatch = clean.match(/^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i)
  if (pseudoHttpsMatch?.[1]) {
    return pseudoHttpsMatch[1].toLowerCase()
  }
  const trimmed = clean.replace(/\/+$/, '')
  return path.posix.basename(trimmed).toLowerCase()
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
        const byBaseName = currentUrl ? baseNameMap.get(extractMediaBaseName(currentUrl)) : ''
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
  files?: UploadFolderFile[]
  jsonFilePath?: string
  workspaceId?: string
  clearTargetDir?: boolean
  workspaceSourceRelativePath?: string
}) {
  const {
    files = [],
    jsonFilePath = '',
    workspaceId = '',
    clearTargetDir = false,
    workspaceSourceRelativePath = '',
  } = params
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  const normalizedWorkspaceSourceRelativePath = String(workspaceSourceRelativePath || '').trim()
  const hasLocalFiles = Array.isArray(files) && files.length > 0
  const useWorkspaceFolder = !hasLocalFiles && Boolean(normalizedWorkspaceSourceRelativePath)

  if (!hasLocalFiles && !useWorkspaceFolder) {
    throw new Error('at least one upload file is required, or workspaceSourceRelativePath must be provided')
  }

  let uploadedFiles: UploadRewriteSummary['uploadedFiles'] = []
  let relativePathMap = new Map<string, string>()
  let baseNameMap = new Map<string, string>()

  if (useWorkspaceFolder) {
    if (!normalizedWorkspaceId) {
      throw new Error('workspaceId is required when using workspaceSourceRelativePath')
    }
    await ensureWorkspace({ workspaceId: normalizedWorkspaceId })
    const workspaceFolderFiles = await collectWorkspaceFolderFiles({
      workspaceId: normalizedWorkspaceId,
      workspaceSourceRelativePath: normalizedWorkspaceSourceRelativePath,
    })
    uploadedFiles = workspaceFolderFiles.uploadedFiles
    relativePathMap = workspaceFolderFiles.relativePathMap
    baseNameMap = workspaceFolderFiles.baseNameMap
  } else {
    const targetRoot = normalizedWorkspaceId
      ? path.join(getWorkspaceDir(normalizedWorkspaceId), 'uploads', 'source_uploads')
      : UPLOAD_DIR
    if (normalizedWorkspaceId) {
      await ensureWorkspace({ workspaceId: normalizedWorkspaceId })
    } else {
      await fsp.mkdir(UPLOAD_DIR, { recursive: true })
    }
    if (clearTargetDir) {
      await fsp.rm(targetRoot, { recursive: true, force: true })
    }
    await fsp.mkdir(targetRoot, { recursive: true })

    const basenameCounts = new Map<string, number>()

    for (const file of files) {
      const relativePath = sanitizeUploadRelativePath(file.relativePath || file.originalname, file.originalname)
      const destination = path.resolve(targetRoot, relativePath)
      const resolvedRoot = path.resolve(targetRoot)
      if (!destination.startsWith(resolvedRoot)) {
        throw new Error(`Upload target escapes uploads directory: ${relativePath}`)
      }

      await fsp.mkdir(path.dirname(destination), { recursive: true })
      const bytes = Buffer.isBuffer(file.buffer)
        ? file.buffer
        : await readUploadedFileBuffer(file as Express.Multer.File)
      await fsp.writeFile(destination, bytes)

      const publicUrl = normalizedWorkspaceId
        ? toWorkspaceUploadUrl(normalizedWorkspaceId, relativePath)
        : toPublicUploadUrl(relativePath)
      uploadedFiles.push({
        relativePath,
        publicUrl,
      })
      for (const candidate of buildRelativePathCandidates(relativePath)) {
        relativePathMap.set(candidate, publicUrl)
      }

      const baseName = path.posix.basename(relativePath).toLowerCase()
      basenameCounts.set(baseName, (basenameCounts.get(baseName) || 0) + 1)
      baseNameMap.set(baseName, publicUrl)
    }

    for (const [baseName, count] of basenameCounts.entries()) {
      if (count > 1) {
        baseNameMap.delete(baseName)
      }
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
    sourceMode: useWorkspaceFolder ? 'workspace_folder' : 'local_upload',
    uploadedFiles,
  } satisfies UploadRewriteSummary
}
