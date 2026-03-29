import fsp from 'node:fs/promises'
import path from 'node:path'
import { ARK_MODEL, REPAIR_JSON_DIR, UPLOAD_DIR } from './config'
import { isObject, resolveQuestionTarget } from './question-json-target'
import {
  extractArkText,
  loadTextbookJson,
  normalizeJsonFileName,
  normalizeQuestionType,
  requestArkRawWithRetry,
  sanitizeFileName,
  saveTextbookJson,
  toImageDataUrl,
} from './question-bank-service'

type JsonNode = Record<string, unknown>

function buildRepairJsonFileName(sourceFileName: string, jsonFilePath: string) {
  const preferred = String(sourceFileName || '').trim()
  if (preferred) {
    const base = path.basename(preferred).replace(/[\\/:*?"<>|]/g, '_')
    return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
  }
  return normalizeJsonFileName(path.basename(jsonFilePath))
}

function normalizeTextBlock(value: unknown) {
  if (typeof value === 'string') {
    return {
      text: value,
      media: [] as Array<Record<string, unknown>>,
    }
  }
  if (isObject(value)) {
    return {
      text: String(value.text || ''),
      media: Array.isArray(value.media) ? value.media.filter(isObject) : [],
    }
  }
  return {
    text: '',
    media: [] as Array<Record<string, unknown>>,
  }
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

function collectImageUrlsFromMedia(mediaItems: Array<Record<string, unknown>>) {
  return mediaItems
    .map((item) => String(item?.url || '').trim())
    .filter((url) => Boolean(url) && !url.startsWith('data:'))
}

function resolveUploadUrlToFilePath(url: string) {
  const raw = String(url || '').trim().split('?')[0]
  if (!raw.startsWith('/uploads/')) {
    return ''
  }
  const relativePath = raw.replace(/^\/uploads\//, '')
  const resolved = path.resolve(UPLOAD_DIR, relativePath)
  const uploadRoot = path.resolve(UPLOAD_DIR)
  return resolved.startsWith(uploadRoot) ? resolved : ''
}

async function collectImageDataUrls(imageUrls: string[]) {
  const items: string[] = []
  for (const url of imageUrls) {
    const filePath = resolveUploadUrlToFilePath(url)
    if (!filePath) {
      continue
    }
    const stat = await fsp.stat(filePath).catch(() => null)
    if (!stat || !stat.isFile()) {
      continue
    }
    items.push(await toImageDataUrl(filePath))
  }
  return items
}

function buildAnswerInstruction(params: {
  chapterTitle: string
  sectionTitle: string
  questionTitle: string
  questionType: string
  stemText?: string
  promptText: string
  answerPrompt?: string
}) {
  const {
    chapterTitle,
    sectionTitle,
    questionTitle,
    questionType,
    stemText = '',
    promptText,
    answerPrompt = '',
  } = params

  return [
    '你是一名题库标准答案生成助手。',
    '请基于题目文字和配图，直接生成可以写回 standardAnswer.text 的答案正文。',
    '允许使用 Markdown、LaTeX 和代码块。',
    '不要输出 JSON，不要输出多余前言，不要解释你正在做什么。',
    '如果信息仍不完整，请先用一句话说明缺失点，再给出基于可见信息的最合理答案。',
    normalizeQuestionType(questionType) === 'code'
      ? '如果这是编程题，请优先给出简洁思路、核心代码和必要说明。'
      : '如果是非编程题，请优先给出清晰、可直接作为标准答案的解答。',
    `章节: ${chapterTitle || '未标注'}`,
    `小节/结构: ${sectionTitle || '未标注'}`,
    `题目标题: ${questionTitle || '未命名题目'}`,
    `题型: ${questionType || '未分类'}`,
    stemText ? `题干:\n${stemText}` : '',
    `题目:\n${promptText}`,
    answerPrompt ? `补充要求:\n${answerPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function generateQuestionAnswerInTextbookJson(params: {
  jsonFilePath: string
  sourceFileName?: string
  questionId: string
  childQuestionId?: string
  childNo?: number | null
  answerPrompt?: string
}) {
  const {
    jsonFilePath,
    sourceFileName = '',
    questionId,
    childQuestionId = '',
    childNo = null,
    answerPrompt = '',
  } = params

  const normalizedQuestionId = String(questionId || '').trim()
  if (!normalizedQuestionId) {
    throw new Error('questionId is required')
  }

  const payload = await loadTextbookJson(jsonFilePath)
  const target = resolveQuestionTarget({
    payload,
    questionId: normalizedQuestionId,
    childQuestionId,
    childNo,
  })

  const questionNode = target.questionNode
  const childNode = target.childNode
  const nodeType = String(questionNode.nodeType || '').toUpperCase()

  if (nodeType === 'GROUP' && !childNode) {
    throw new Error('GROUP question requires childQuestionId or childNo to generate answer')
  }

  const stemBlock = normalizeTextBlock(questionNode.stem)
  const promptBlock = childNode
    ? normalizeTextBlock(childNode.prompt)
    : nodeType === 'GROUP'
      ? normalizeTextBlock(questionNode.stem)
      : normalizeTextBlock(questionNode.prompt)

  const imageUrls = [
    ...collectImageUrlsFromMedia(stemBlock.media),
    ...collectImageUrlsFromMedia(promptBlock.media),
  ]
  const imageDataUrls = await collectImageDataUrls(imageUrls)

  const questionType = childNode
    ? String(childNode.questionType || questionNode.questionType || '').trim()
    : String(questionNode.questionType || '').trim()
  const targetTitle = childNode
    ? String(childNode.title || childNode.questionId || target.questionTitle || '').trim()
    : target.questionTitle

  const instruction = buildAnswerInstruction({
    chapterTitle: target.chapterTitle,
    sectionTitle: target.sectionTitle,
    questionTitle: targetTitle,
    questionType,
    stemText: childNode ? stemBlock.text : '',
    promptText: promptBlock.text,
    answerPrompt,
  })

  const raw = await requestArkRawWithRetry({
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: '你只输出答案正文，允许使用 Markdown、LaTeX 和代码块，不要输出 JSON。',
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: instruction },
          ...imageDataUrls.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
        ],
      },
    ],
    temperature: 0.2,
  } as Record<string, unknown>)

  const parsed = JSON.parse(raw) as unknown
  const answerText = String(extractArkText(parsed) || '').trim()
  if (!answerText) {
    throw new Error('Ark response has no answer text')
  }

  const answerBlock = childNode
    ? getOrCreateTextBlock(childNode, 'standardAnswer')
    : getOrCreateTextBlock(questionNode, 'standardAnswer')
  answerBlock.text = answerText
  answerBlock.media = []

  await saveTextbookJson(jsonFilePath, payload)

  await fsp.mkdir(REPAIR_JSON_DIR, { recursive: true })
  const repairJsonFileName = buildRepairJsonFileName(sourceFileName, jsonFilePath)
  const repairJsonPath = path.join(REPAIR_JSON_DIR, sanitizeFileName(repairJsonFileName))
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
    targetLabel: childNode ? '小题答案' : '题目答案',
    question: questionNode,
    answerText,
    imageCount: imageDataUrls.length,
  }
}
