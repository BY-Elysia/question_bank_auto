import fsp from 'node:fs/promises'
import path from 'node:path'
import { QUESTION_MEDIA_DIR } from './config'
import {
  buildLegacyQuestionId,
  isObject,
  resolveQuestionTarget,
} from './question-json-target'
import type { TextbookJsonPayload } from './types'
import { loadTextbookJson, normalizeJsonFileName, saveTextbookJson, sanitizeFileName } from './question-bank-service'
import { readUploadedFileBuffer } from './upload'
import { ensureWorkspace, getWorkspaceDir } from './workspace-store'

type JsonNode = Record<string, unknown>
type ImageAttachTargetType = 'prompt' | 'standardAnswer'

function getOrCreateTextBlock(host: JsonNode, key: string) {
  const current = host[key]
  if (isObject(current)) {
    if (typeof current.text !== 'string') {
      current.text = ''
    }
    if (!Array.isArray(current.media)) {
      current.media = []
    }
    return current
  }
  const block = {
    text: typeof current === 'string' ? current : '',
    media: [] as unknown[],
  }
  host[key] = block
  return block
}

function resolveImageTarget(params: {
  payload: TextbookJsonPayload
  chapterNo?: number
  sectionNo?: number
  questionNo?: number
  questionId?: string
  childQuestionId?: string
  childNo?: number | null
  targetType: ImageAttachTargetType
}) {
  const {
    payload,
    chapterNo,
    sectionNo,
    questionNo,
    questionId = '',
    childQuestionId = '',
    childNo = null,
    targetType,
  } = params
  const resolvedQuestionId = String(questionId || '').trim()
    || (
      Number.isInteger(chapterNo) &&
      Number.isInteger(sectionNo) &&
      Number.isInteger(questionNo)
        ? buildLegacyQuestionId(Number(chapterNo), Number(sectionNo), Number(questionNo))
        : ''
    )

  const target = resolveQuestionTarget({
    payload,
    questionId: resolvedQuestionId,
    childQuestionId,
    childNo,
  })

  if (target.childNode) {
    const targetField = targetType === 'standardAnswer' ? 'standardAnswer' : 'prompt'
    return {
      ...target,
      textBlock: getOrCreateTextBlock(target.childNode, targetField),
      targetField,
      targetLabel: targetType === 'standardAnswer' ? '小题 standardAnswer.media' : '小题 prompt.media',
    }
  }

  const nodeType = String(target.questionNode.nodeType || '').toUpperCase()
  if (targetType === 'standardAnswer') {
    if (nodeType === 'GROUP') {
      throw new Error('GROUP 大题没有 standardAnswer.media，请改为补到小题答案，或选择题目图片区')
    }
    return {
      ...target,
      textBlock: getOrCreateTextBlock(target.questionNode, 'standardAnswer'),
      targetField: 'standardAnswer',
      targetLabel: '题目 standardAnswer.media',
    }
  }

  if (nodeType === 'GROUP') {
    return {
      ...target,
      textBlock: getOrCreateTextBlock(target.questionNode, 'stem'),
      targetField: 'stem',
      targetLabel: '题目 stem.media',
    }
  }

  return {
    ...target,
    textBlock: getOrCreateTextBlock(target.questionNode, 'prompt'),
    targetField: 'prompt',
    targetLabel: '题目 prompt.media',
  }
}

function buildTargetFolderName(sourceFileName: string, jsonFilePath: string, targetKey: string, targetField: string) {
  const normalizedFileName = normalizeJsonFileName(
    path.basename(String(sourceFileName || '').trim() || path.basename(jsonFilePath)),
  )
  const sourceBase = path.basename(normalizedFileName, '.json')
  const safeSourceBase = sanitizeFileName(sourceBase || 'textbook')
  return path.join(safeSourceBase, targetKey, sanitizeFileName(targetField || 'prompt'))
}

export async function attachImagesToQuestionInTextbookJson(params: {
  jsonFilePath: string
  sourceFileName?: string
  chapterNo?: number
  sectionNo?: number
  questionNo?: number
  questionId?: string
  childQuestionId?: string
  childNo?: number | null
  targetType?: ImageAttachTargetType
  workspaceId?: string
  files: Array<{
    originalname: string
    buffer?: Buffer
    path?: string
  }>
}) {
  const {
    jsonFilePath,
    sourceFileName = '',
    chapterNo,
    sectionNo,
    questionNo,
    questionId = '',
    childQuestionId = '',
    childNo = null,
    targetType = 'prompt',
    workspaceId = '',
    files,
  } = params
  const normalizedTargetType: ImageAttachTargetType = targetType === 'standardAnswer' ? 'standardAnswer' : 'prompt'
  const hasLegacyQuestionRef =
    Number.isInteger(chapterNo) &&
    Number(chapterNo) > 0 &&
    Number.isInteger(sectionNo) &&
    Number(sectionNo) > 0 &&
    Number.isInteger(questionNo) &&
    Number(questionNo) > 0

  if (!String(questionId || '').trim() && !hasLegacyQuestionRef) {
    throw new Error('questionId is required, or chapterNo/sectionNo/questionNo must all be positive integers')
  }
  if (!Array.isArray(files) || !files.length) {
    throw new Error('at least one image file is required')
  }

  const payload = await loadTextbookJson(jsonFilePath)
  const target = resolveImageTarget({
    payload,
    chapterNo,
    sectionNo,
    questionNo,
    questionId,
    childQuestionId,
    childNo,
    targetType: normalizedTargetType,
  })

  const targetKey = target.childQuestionId || target.questionId
  const targetField = String(target.targetField || 'prompt')
  const relativeTargetDir = buildTargetFolderName(sourceFileName, jsonFilePath, targetKey, targetField)
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (normalizedWorkspaceId) {
    await ensureWorkspace({ workspaceId: normalizedWorkspaceId })
  }
  const targetDir = normalizedWorkspaceId
    ? path.join(getWorkspaceDir(normalizedWorkspaceId), 'uploads', 'question_media', relativeTargetDir)
    : path.join(QUESTION_MEDIA_DIR, relativeTargetDir)
  await fsp.rm(targetDir, { recursive: true, force: true })
  await fsp.mkdir(targetDir, { recursive: true })

  const mediaItems = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png'
    const storedFileName = `${targetKey}_${targetField}_${String(index + 1).padStart(2, '0')}${ext}`
    const filePath = path.join(targetDir, storedFileName)
    const bytes = Buffer.isBuffer(file.buffer)
      ? file.buffer
      : await readUploadedFileBuffer(file as Express.Multer.File)
    await fsp.writeFile(filePath, bytes)
    const publicUrl = normalizedWorkspaceId
      ? `/workspace-assets/${normalizedWorkspaceId}/uploads/question_media/${relativeTargetDir.replace(/\\/g, '/')}/${storedFileName}`
      : `/uploads/question_media/${path.basename(path.dirname(targetDir))}/${path.basename(targetDir)}/${storedFileName}`
    mediaItems.push({
      type: 'image',
      url: publicUrl,
      caption: '',
      orderNo: index + 1,
    })
  }

  target.textBlock.media = mediaItems
  await saveTextbookJson(jsonFilePath, payload)

  return {
    message: 'success',
    jsonFilePath,
    chapterTitle: target.chapterTitle,
    sectionTitle: target.sectionTitle,
    questionId: target.questionId,
    childQuestionId: target.childQuestionId,
    questionTitle: target.questionTitle,
    targetType: normalizedTargetType,
    targetLabel: target.targetLabel,
    mediaCount: mediaItems.length,
    mediaItems,
  }
}
