import fsp from 'node:fs/promises'
import path from 'node:path'
import { QUESTION_MEDIA_DIR } from './config'
import { normalizeJsonFileName, sanitizeFileName } from './question-bank-service'
import { getWorkspaceDir } from './workspace-store'

export type QuestionMediaBufferItem = {
  buffer: Buffer
  caption?: string
  extension?: string
}

export type StoredQuestionMediaItem = {
  type: 'image'
  url: string
  caption: string
  orderNo: number
}

function sanitizePathToken(value: string, fallback: string) {
  return sanitizeFileName(String(value || '').trim()) || fallback
}

function normalizeExtension(extension: string) {
  const normalized = String(extension || '').trim().toLowerCase()
  if (normalized === '.jpg' || normalized === '.jpeg') return '.jpg'
  if (normalized === '.webp') return '.webp'
  return '.png'
}

export function buildQuestionMediaRelativeTargetDir(params: {
  sourceFileName?: string
  jsonFilePath: string
  targetKey: string
  targetField: string
  namespace?: string
}) {
  const normalizedFileName = normalizeJsonFileName(
    path.basename(String(params.sourceFileName || '').trim() || path.basename(params.jsonFilePath)),
  )
  const sourceBase = path.basename(normalizedFileName, '.json')
  const parts = [sanitizePathToken(sourceBase, 'textbook')]
  const namespace = sanitizeFileName(String(params.namespace || '').trim())
  if (namespace) {
    parts.push(namespace)
  }
  parts.push(sanitizePathToken(params.targetKey, 'question'))
  parts.push(sanitizePathToken(params.targetField, 'prompt'))
  return path.join(...parts)
}

function buildQuestionMediaPublicUrl(workspaceId: string, relativeTargetDir: string, storedFileName: string) {
  const relative = relativeTargetDir.replace(/\\/g, '/')
  if (String(workspaceId || '').trim()) {
    return `/workspace-assets/${workspaceId}/uploads/question_media/${relative}/${storedFileName}`
  }
  return `/uploads/question_media/${relative}/${storedFileName}`
}

export async function writeQuestionMediaBuffers(params: {
  workspaceId?: string
  sourceFileName?: string
  jsonFilePath: string
  targetKey: string
  targetField: string
  namespace?: string
  files: QuestionMediaBufferItem[]
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  const relativeTargetDir = buildQuestionMediaRelativeTargetDir({
    sourceFileName: params.sourceFileName,
    jsonFilePath: params.jsonFilePath,
    targetKey: params.targetKey,
    targetField: params.targetField,
    namespace: params.namespace,
  })
  const targetDir = workspaceId
    ? path.join(getWorkspaceDir(workspaceId), 'uploads', 'question_media', relativeTargetDir)
    : path.join(QUESTION_MEDIA_DIR, relativeTargetDir)

  await fsp.rm(targetDir, { recursive: true, force: true }).catch(() => undefined)
  await fsp.mkdir(targetDir, { recursive: true })

  const items: StoredQuestionMediaItem[] = []
  const files = Array.isArray(params.files) ? params.files : []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (!Buffer.isBuffer(file?.buffer) || !file.buffer.length) {
      continue
    }
    const storedFileName = `${sanitizePathToken(params.targetKey, 'question')}_${sanitizePathToken(params.targetField, 'prompt')}_${String(index + 1).padStart(2, '0')}${normalizeExtension(file.extension || '.png')}`
    const filePath = path.join(targetDir, storedFileName)
    await fsp.writeFile(filePath, file.buffer)
    items.push({
      type: 'image',
      url: buildQuestionMediaPublicUrl(workspaceId, relativeTargetDir, storedFileName),
      caption: String(file.caption || '').trim(),
      orderNo: items.length + 1,
    })
  }

  return {
    targetDir,
    relativeTargetDir,
    mediaItems: items,
  }
}
