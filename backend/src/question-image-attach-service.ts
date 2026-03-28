import fsp from 'node:fs/promises'
import path from 'node:path'
import { QUESTION_MEDIA_DIR, REPAIR_JSON_DIR } from './config'
import {
  buildLegacyQuestionId,
  isObject,
  resolveQuestionTarget,
} from './question-json-target'
import type { TextbookJsonPayload } from './types'
import { loadTextbookJson, normalizeJsonFileName, saveTextbookJson, sanitizeFileName } from './question-bank-service'
import { readUploadedFileBuffer } from './upload'

type JsonNode = Record<string, unknown>

function buildRepairJsonFileName(sourceFileName: string, jsonFilePath: string) {
  const preferred = String(sourceFileName || '').trim()
  if (preferred) {
    const base = path.basename(preferred).replace(/[\\/:*?"<>|]/g, '_')
    return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
  }
  return normalizeJsonFileName(path.basename(jsonFilePath))
}

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
}) {
  const {
    payload,
    chapterNo,
    sectionNo,
    questionNo,
    questionId = '',
    childQuestionId = '',
    childNo = null,
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
    return {
      ...target,
      textBlock: getOrCreateTextBlock(target.childNode, 'prompt'),
      targetLabel: '小题 prompt.media',
    }
  }

  const nodeType = String(target.questionNode.nodeType || '').toUpperCase()
  if (nodeType === 'GROUP') {
    return {
      ...target,
      textBlock: getOrCreateTextBlock(target.questionNode, 'stem'),
      targetLabel: '题目 stem.media',
    }
  }

  return {
    ...target,
    textBlock: getOrCreateTextBlock(target.questionNode, 'prompt'),
    targetLabel: '题目 prompt.media',
  }
}

function buildTargetFolderName(sourceFileName: string, jsonFilePath: string, targetKey: string) {
  const sourceBase = path.basename(String(sourceFileName || '').trim() || path.basename(jsonFilePath), '.json')
  const safeSourceBase = sanitizeFileName(sourceBase || 'textbook')
  return path.join(QUESTION_MEDIA_DIR, safeSourceBase, targetKey)
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
    files,
  } = params
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
  })

  const targetKey = target.childQuestionId || target.questionId
  const targetDir = buildTargetFolderName(sourceFileName, jsonFilePath, targetKey)
  await fsp.rm(targetDir, { recursive: true, force: true })
  await fsp.mkdir(targetDir, { recursive: true })

  const mediaItems = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png'
    const storedFileName = `${targetKey}_${String(index + 1).padStart(2, '0')}${ext}`
    const filePath = path.join(targetDir, storedFileName)
    const bytes = Buffer.isBuffer(file.buffer)
      ? file.buffer
      : await readUploadedFileBuffer(file as Express.Multer.File)
    await fsp.writeFile(filePath, bytes)
    mediaItems.push({
      type: 'image',
      url: `/uploads/question_media/${path.basename(path.dirname(targetDir))}/${path.basename(targetDir)}/${storedFileName}`,
      caption: '',
      orderNo: index + 1,
    })
  }

  target.textBlock.media = mediaItems
  await saveTextbookJson(jsonFilePath, payload)

  await fsp.mkdir(REPAIR_JSON_DIR, { recursive: true })
  const repairJsonFileName = buildRepairJsonFileName(sourceFileName, jsonFilePath)
  const repairJsonPath = path.join(REPAIR_JSON_DIR, repairJsonFileName)
  await fsp.writeFile(repairJsonPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' })

  return {
    message: 'success',
    jsonFilePath,
    repairJsonFileName,
    repairJsonPath,
    chapterTitle: target.chapterTitle,
    sectionTitle: target.sectionTitle,
    questionId: target.questionId,
    childQuestionId: target.childQuestionId,
    questionTitle: target.questionTitle,
    targetLabel: target.targetLabel,
    mediaCount: mediaItems.length,
    mediaItems,
  }
}
