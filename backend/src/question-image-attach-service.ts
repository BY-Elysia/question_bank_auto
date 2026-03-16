import fsp from 'node:fs/promises'
import path from 'node:path'
import { QUESTION_MEDIA_DIR, REPAIR_JSON_DIR } from './config'
import type { TextbookJsonPayload } from './types'
import { loadTextbookJson, normalizeJsonFileName, saveTextbookJson, sanitizeFileName } from './question-bank-service'

type JsonNode = Record<string, unknown>

function isObject(value: unknown): value is JsonNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function findChapterById(payload: TextbookJsonPayload, chapterId: string) {
  return payload.chapters.find((item) => item.chapterId === chapterId) || null
}

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

function findQuestionNode(payload: TextbookJsonPayload, questionId: string) {
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  return (
    questions.find((item) => isObject(item) && typeof item.questionId === 'string' && item.questionId.trim() === questionId) ||
    null
  ) as JsonNode | null
}

function findChildNode(questionNode: JsonNode, childNo: number) {
  const children = Array.isArray(questionNode.children) ? questionNode.children.filter(isObject) : []
  if (!children.length) {
    return null
  }

  const byOrder = children.find((child) => Number(child.orderNo) === childNo)
  if (byOrder) {
    return byOrder
  }

  const suffix = `_${childNo}`
  const byId = children.find(
    (child) => typeof child.questionId === 'string' && child.questionId.trim().endsWith(suffix),
  )
  if (byId) {
    return byId
  }

  return children[childNo - 1] || null
}

function resolveImageTarget(params: {
  payload: TextbookJsonPayload
  chapterNo: number
  sectionNo: number
  questionNo: number
  childNo?: number | null
}) {
  const { payload, chapterNo, sectionNo, questionNo, childNo = null } = params
  const topChapterId = `ch_${chapterNo}`
  const sectionChapterId = `ch_${chapterNo}_${sectionNo}`
  const questionId = `q_${chapterNo}_${sectionNo}_${questionNo}`

  const topChapter = findChapterById(payload, topChapterId)
  if (!topChapter) {
    throw new Error(`chapterId ${topChapterId} not found in JSON`)
  }
  const section = findChapterById(payload, sectionChapterId)
  if (!section) {
    throw new Error(`chapterId ${sectionChapterId} not found in JSON`)
  }
  const questionNode = findQuestionNode(payload, questionId)
  if (!questionNode) {
    throw new Error(`questionId ${questionId} not found in JSON`)
  }

  const questionTitle =
    typeof questionNode.title === 'string' && questionNode.title.trim() ? questionNode.title.trim() : questionId

  if (Number.isInteger(childNo) && Number(childNo) > 0) {
    const childNode = findChildNode(questionNode, Number(childNo))
    if (!childNode) {
      throw new Error(`childNo ${childNo} not found under questionId ${questionId}`)
    }
    return {
      topChapter,
      section,
      questionNode,
      childNode,
      textBlock: getOrCreateTextBlock(childNode, 'prompt'),
      questionId,
      childQuestionId: typeof childNode.questionId === 'string' ? childNode.questionId : '',
      questionTitle,
      targetLabel: `小题 ${childNo} prompt.media`,
    }
  }

  const nodeType = String(questionNode.nodeType || '').toUpperCase()
  if (nodeType === 'GROUP') {
    return {
      topChapter,
      section,
      questionNode,
      childNode: null,
      textBlock: getOrCreateTextBlock(questionNode, 'stem'),
      questionId,
      childQuestionId: '',
      questionTitle,
      targetLabel: '题目 stem.media',
    }
  }

  return {
    topChapter,
    section,
    questionNode,
    childNode: null,
    textBlock: getOrCreateTextBlock(questionNode, 'prompt'),
    questionId,
    childQuestionId: '',
    questionTitle,
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
  chapterNo: number
  sectionNo: number
  questionNo: number
  childNo?: number | null
  files: Array<{
    originalname: string
    buffer: Buffer
  }>
}) {
  const {
    jsonFilePath,
    sourceFileName = '',
    chapterNo,
    sectionNo,
    questionNo,
    childNo = null,
    files,
  } = params

  if (!Number.isInteger(chapterNo) || chapterNo <= 0) {
    throw new Error('chapterNo must be a positive integer')
  }
  if (!Number.isInteger(sectionNo) || sectionNo <= 0) {
    throw new Error('sectionNo must be a positive integer')
  }
  if (!Number.isInteger(questionNo) || questionNo <= 0) {
    throw new Error('questionNo must be a positive integer')
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
    await fsp.writeFile(filePath, file.buffer)
    mediaItems.push({
      type: 'image',
      url: `/uploads/question_media/${path.basename(path.dirname(targetDir))}/${path.basename(targetDir)}/${storedFileName}`,
      caption: file.originalname || '',
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
    chapterTitle: target.topChapter.title,
    sectionTitle: target.section.title,
    questionId: target.questionId,
    childQuestionId: target.childQuestionId,
    questionTitle: target.questionTitle,
    targetLabel: target.targetLabel,
    mediaCount: mediaItems.length,
    mediaItems,
  }
}
