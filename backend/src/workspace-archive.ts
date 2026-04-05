import { execFile } from 'node:child_process'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { UPLOAD_DIR, WORKSPACES_DIR } from './config'
import { loadTextbookJson, sanitizeFileName } from './question-bank-service'
import type { QuestionItem, QuestionTextBlock, TextbookJsonPayload } from './types'
import { getWorkspaceDir, resolveWorkspaceEntry } from './workspace-store'

const execFileAsync = promisify(execFile)

type ExportMediaItem = {
  folderName: string
  sourcePath: string
  sourceFileName: string
  mediaRef: Record<string, unknown>
}

function normalizeSlashes(value: string) {
  return String(value || '').replace(/\\/g, '/')
}

function getMediaUrlFileName(rawUrl: string) {
  const clean = normalizeSlashes(String(rawUrl || '').trim().split('?')[0])
  return path.posix.basename(clean || 'image.png') || 'image.png'
}

function resolveMediaFilePath(rawUrl: string) {
  const clean = normalizeSlashes(String(rawUrl || '').trim().split('?')[0])
  if (!clean) {
    return ''
  }

  const workspaceMatch = clean.match(/^\/workspace-assets\/([^/]+)\/(.+)$/)
  if (workspaceMatch?.[1] && workspaceMatch?.[2]) {
    return path.resolve(WORKSPACES_DIR, workspaceMatch[1], workspaceMatch[2])
  }
  if (clean.startsWith('/uploads/')) {
    return path.resolve(UPLOAD_DIR, clean.replace(/^\/uploads\//, ''))
  }
  if (clean.startsWith('uploads/')) {
    return path.resolve(UPLOAD_DIR, clean.replace(/^uploads\//, ''))
  }
  return ''
}

function collectQuestionBlockMedia(
  items: ExportMediaItem[],
  folderName: string,
  block: QuestionTextBlock | null | undefined,
) {
  if (!folderName || !block || !Array.isArray(block.media)) {
    return
  }

  for (const media of block.media) {
    if (!media || typeof media !== 'object') {
      continue
    }
    const rawUrl = String(media.url || '').trim()
    const sourcePath = resolveMediaFilePath(rawUrl)
    if (!sourcePath) {
      continue
    }
    items.push({
      folderName,
      sourcePath,
      sourceFileName: getMediaUrlFileName(rawUrl),
      mediaRef: media as Record<string, unknown>,
    })
  }
}

function collectExportMediaItems(payload: TextbookJsonPayload) {
  const items: ExportMediaItem[] = []
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  for (const question of questions.filter((item) => item && typeof item === 'object') as QuestionItem[]) {
    collectQuestionBlockMedia(
      items,
      String(question.questionId || '').trim(),
      question.nodeType === 'GROUP' ? question.stem : question.prompt,
    )
    if (question.nodeType === 'GROUP') {
      for (const child of Array.isArray(question.children) ? question.children : []) {
        collectQuestionBlockMedia(items, String(child?.questionId || '').trim(), child?.prompt)
        collectQuestionBlockMedia(items, String(child?.questionId || '').trim(), child?.standardAnswer)
      }
      continue
    }
    collectQuestionBlockMedia(items, String(question.questionId || '').trim(), question.standardAnswer)
  }
  return items
}

function clonePayload(payload: TextbookJsonPayload) {
  return JSON.parse(JSON.stringify(payload)) as TextbookJsonPayload
}

function normalizeDeliverableQuestionTypes(payload: TextbookJsonPayload) {
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  for (const question of questions.filter((item) => item && typeof item === 'object') as QuestionItem[]) {
    if (String(question.questionType || '').trim().toLowerCase() === 'code') {
      question.questionType = 'CODE'
    }
    if (question.nodeType !== 'GROUP') {
      continue
    }
    for (const child of Array.isArray(question.children) ? question.children : []) {
      if (String(child?.questionType || '').trim().toLowerCase() === 'code') {
        child.questionType = 'CODE'
      }
    }
  }
}

function allocateUniqueFileName(usedNames: Set<string>, originalName: string) {
  const parsed = path.parse(originalName || 'image.png')
  const baseName = parsed.name || 'image'
  const extension = parsed.ext || '.png'
  let candidate = `${baseName}${extension}`
  let index = 2
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName}_${index}${extension}`
    index += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

async function materializeDeliverablePackage(params: {
  workspaceId: string
  outputRoot: string
}) {
  const questionMediaRootName = 'question_media'
  const workspaceDir = getWorkspaceDir(params.workspaceId)
  const jsonFilePath = path.join(workspaceDir, 'output_json', 'main.json')
  const originalPayload = await loadTextbookJson(jsonFilePath)
  const deliverablePayload = clonePayload(originalPayload)
  normalizeDeliverableQuestionTypes(deliverablePayload)
  const mediaItems = collectExportMediaItems(deliverablePayload)
  if (!mediaItems.length) {
    throw new Error(`workspace ${params.workspaceId} has no question images to download`)
  }

  const usedNamesByFolder = new Map<string, Set<string>>()
  const resolvedBySource = new Map<string, string>()
  let copiedCount = 0

  for (const item of mediaItems) {
    const folderName = String(item.folderName || '').trim()
    if (!folderName) {
      continue
    }
    const sourceStat = await fsp.stat(item.sourcePath).catch(() => null)
    if (!sourceStat?.isFile()) {
      continue
    }

    const dedupeKey = `${folderName}::${item.sourcePath}::${item.sourceFileName}`
    let relativeUrl = resolvedBySource.get(dedupeKey) || ''
    if (!relativeUrl) {
      const folderDir = path.join(params.outputRoot, questionMediaRootName, folderName)
      await fsp.mkdir(folderDir, { recursive: true })
      const usedNames = usedNamesByFolder.get(folderName) || new Set<string>()
      usedNamesByFolder.set(folderName, usedNames)
      const destinationFileName = allocateUniqueFileName(usedNames, item.sourceFileName)
      await fsp.copyFile(item.sourcePath, path.join(folderDir, destinationFileName))
      relativeUrl = `${questionMediaRootName}/${folderName}/${destinationFileName}`
      resolvedBySource.set(dedupeKey, relativeUrl)
      copiedCount += 1
    }

    item.mediaRef.url = relativeUrl
  }

  if (!copiedCount) {
    throw new Error(`workspace ${params.workspaceId} has no readable question images to download`)
  }

  await fsp.writeFile(
    path.join(params.outputRoot, 'main.json'),
    `${JSON.stringify(deliverablePayload, null, 2)}\n`,
    'utf8',
  )
}

async function createArchiveFromPath(params: {
  sourcePath: string
  archiveDir: string
  archiveBaseName: string
}) {
  const archiveBaseName = sanitizeFileName(params.archiveBaseName) || 'workspace_download'
  await fsp.mkdir(params.archiveDir, { recursive: true })

  if (process.platform === 'win32') {
    const archivePath = path.join(params.archiveDir, `${archiveBaseName}.zip`)
    await execFileAsync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -LiteralPath '${params.sourcePath.replace(/'/g, "''")}' -DestinationPath '${archivePath.replace(/'/g, "''")}' -Force`,
      ],
      {
        windowsHide: true,
      },
    )
    return {
      archivePath,
      downloadFileName: `${archiveBaseName}.zip`,
    }
  }

  const archivePath = path.join(params.archiveDir, `${archiveBaseName}.tar.gz`)
  await execFileAsync('tar', ['-czf', archivePath, path.basename(params.sourcePath)], {
    cwd: path.dirname(params.sourcePath),
    windowsHide: true,
  })
  return {
    archivePath,
    downloadFileName: `${archiveBaseName}.tar.gz`,
  }
}

export async function createWorkspaceDeliverableArchive(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    throw new Error('workspaceId is required')
  }

  const archiveDir = path.join(os.tmpdir(), 'question-bank-auto-archives')
  await fsp.mkdir(archiveDir, { recursive: true })

  const folderBaseName = `${normalizedWorkspaceId}_deliverable`
  const stagingDir = path.join(archiveDir, folderBaseName)
  await fsp.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
  await fsp.mkdir(stagingDir, { recursive: true })

  try {
    await materializeDeliverablePackage({
      workspaceId: normalizedWorkspaceId,
      outputRoot: stagingDir,
    })
  } catch (error) {
    await fsp.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  const archive = await createArchiveFromPath({
    sourcePath: stagingDir,
    archiveDir,
    archiveBaseName: folderBaseName,
  })
  return {
    archivePath: archive.archivePath,
    downloadFileName: archive.downloadFileName,
    cleanupPaths: [archive.archivePath, stagingDir],
  }
}

export async function createWorkspaceSelectionArchive(params: {
  workspaceId: string
  relativePath?: string
}) {
  const resolved = await resolveWorkspaceEntry({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
  })
  if (!resolved.isDirectory) {
    throw new Error(`workspace path is not a directory: ${resolved.relativePath || '.'}`)
  }

  const archiveDir = path.join(os.tmpdir(), 'question-bank-auto-archives')
  const suffix = resolved.relativePath
    ? sanitizeFileName(resolved.relativePath.replace(/\//g, '_'))
    : 'workspace'
  const archive = await createArchiveFromPath({
    sourcePath: resolved.targetPath,
    archiveDir,
    archiveBaseName: `${resolved.workspaceId}_${suffix}`,
  })

  return {
    archivePath: archive.archivePath,
    downloadFileName: archive.downloadFileName,
    cleanupPaths: [archive.archivePath],
  }
}
