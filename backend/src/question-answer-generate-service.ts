import fsp from 'node:fs/promises'
import path from 'node:path'
import { ARK_MODEL, UPLOAD_DIR, WORKSPACES_DIR } from './config'
import { isObject, resolveQuestionTarget } from './question-json-target'
import {
  extractArkText,
  loadTextbookJson,
  normalizeQuestionType,
  requestArkRawWithRetry,
  saveTextbookJson,
  toImageDataUrl,
} from './question-bank-service'

type JsonNode = Record<string, unknown>

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

function getOrCreateTextBlock(host: JsonNode, key: string): JsonNode {
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
  const block: JsonNode = {
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
  if (raw.startsWith('/uploads/')) {
    const relativePath = raw.replace(/^\/uploads\//, '')
    const resolved = path.resolve(UPLOAD_DIR, relativePath)
    const uploadRoot = path.resolve(UPLOAD_DIR)
    return resolved.startsWith(uploadRoot) ? resolved : ''
  }

  const workspaceMatch = raw.match(/^\/workspace-assets\/([^/]+)\/(.+)$/)
  if (!workspaceMatch?.[1] || !workspaceMatch?.[2]) {
    return ''
  }
  const workspaceId = workspaceMatch[1]
  const relativePath = workspaceMatch[2]
  const workspaceRoot = path.resolve(WORKSPACES_DIR, workspaceId)
  const resolved = path.resolve(workspaceRoot, relativePath)
  return resolved.startsWith(workspaceRoot) ? resolved : ''
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
  optionLines?: string[]
  answerPrompt?: string
}) {
  const {
    chapterTitle,
    sectionTitle,
    questionTitle,
    questionType,
    stemText = '',
    promptText,
    optionLines = [],
    answerPrompt = '',
  } = params

  return [
    '你是一名题库标准答案生成助手。',
    '请基于题目文字和配图，直接生成可以写回 standardAnswer.text 的答案正文。',
    '允许使用 Markdown、LaTeX 和代码块。',
    '不要输出 JSON，不要输出多余前言，不要解释你正在做什么。',
    '如果信息仍不完整，请先用一句话说明缺失点，再给出基于可见信息的最合理答案。',
    normalizeQuestionType(questionType) === 'CODE'
      ? '如果这是编程题，请优先给出简洁思路、核心代码和必要说明。'
      : normalizeQuestionType(questionType) === 'SINGLE_CHOICE' || normalizeQuestionType(questionType) === 'MULTI_CHOICE'
        ? '如果这是选择题，第一行只写正确选项字母（如 B 或 A,C），后续再写解析；不要把“答案：”前缀和解析混在第一行。'
        : '如果是非编程题，请优先给出清晰、可直接作为标准答案的解答。',
    `章节: ${chapterTitle || '未标注'}`,
    `小节/结构: ${sectionTitle || '未标注'}`,
    `题目标题: ${questionTitle || '未命名题目'}`,
    `题型: ${questionType || '未分类'}`,
    stemText ? `题干:\n${stemText}` : '',
    `题目:\n${promptText}`,
    optionLines.length ? `选项:\n${optionLines.join('\n')}` : '',
    answerPrompt ? `补充要求:\n${answerPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function normalizeChoiceOptionId(value: unknown) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^[\[\(（【]\s*/, '')
    .replace(/\s*[\]\)）】]$/, '')
  return /^[A-Z]$/.test(normalized) ? normalized : ''
}

function formatChoiceOptionLines(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return ''
      }
      const row = item as Record<string, unknown>
      const id = normalizeChoiceOptionId(row.id)
      const text = String(row.text || '').trim()
      return id && text ? `${id}. ${text}` : ''
    })
    .filter(Boolean)
}

function splitChoiceGeneratedAnswer(value: string, questionType: string) {
  const text = String(value || '').trim()
  const directMatch = text.match(
    /^(?:答案|正确答案)?\s*[:：]?\s*([\[\(（【]?[A-Za-z][\]\)）】]?(?:\s*[,，、/]\s*[\[\(（【]?[A-Za-z][\]\)）】]?)*)\s*(?:\r?\n|$)/i,
  )
  const optionIds = String(directMatch?.[1] || '')
    .split(/[\s,，、/]+/)
    .map(normalizeChoiceOptionId)
    .filter(Boolean)
  const normalizedIds = questionType === 'SINGLE_CHOICE' ? optionIds.slice(0, 1) : optionIds
  const consumed = directMatch?.[0] || ''
  const explanation = consumed ? text.slice(consumed.length).trim().replace(/^(?:解析|解答|说明)\s*[:：]?\s*/i, '') : ''
  return {
    text: normalizedIds.join(',') || text,
    explanation,
  }
}

export async function generateQuestionAnswerInTextbookJson(params: {
  jsonFilePath: string
  sourceFileName?: string
  questionId?: string
  questionTitle?: string
  childQuestionId?: string
  childNo?: number | null
  answerPrompt?: string
  imageDataUrls?: string[]
}) {
  const {
    jsonFilePath,
    sourceFileName = '',
    questionId = '',
    questionTitle = '',
    childQuestionId = '',
    childNo = null,
    answerPrompt = '',
    imageDataUrls: extraImageDataUrls = [],
  } = params

  const normalizedQuestionId = String(questionId || '').trim()
  const normalizedQuestionTitle = String(questionTitle || '').trim()
  if (!normalizedQuestionId && !normalizedQuestionTitle) {
    throw new Error('questionId or questionTitle is required')
  }

  const payload = await loadTextbookJson(jsonFilePath)
  const target = resolveQuestionTarget({
    payload,
    questionId: normalizedQuestionId,
    questionTitle: normalizedQuestionTitle,
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
  const imageDataUrls = Array.isArray(extraImageDataUrls) && extraImageDataUrls.length
    ? extraImageDataUrls
    : await collectImageDataUrls(imageUrls)

  const questionType = childNode
    ? String(childNode.questionType || questionNode.questionType || '').trim()
    : String(questionNode.questionType || '').trim()
  const normalizedQuestionType = normalizeQuestionType(questionType)
  const targetTitle = childNode
    ? String(childNode.title || childNode.questionId || target.questionTitle || '').trim()
    : target.questionTitle
  const optionLines = formatChoiceOptionLines(childNode ? childNode.options : questionNode.options)

  const instruction = buildAnswerInstruction({
    chapterTitle: target.chapterTitle,
    sectionTitle: target.sectionTitle,
    questionTitle: targetTitle,
    questionType,
    stemText: childNode ? stemBlock.text : '',
    promptText: promptBlock.text,
    optionLines,
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
  if (normalizedQuestionType === 'SINGLE_CHOICE' || normalizedQuestionType === 'MULTI_CHOICE') {
    const splitAnswer = splitChoiceGeneratedAnswer(answerText, normalizedQuestionType)
    answerBlock.text = splitAnswer.text
    if (splitAnswer.explanation) {
      answerBlock.explanation = splitAnswer.explanation
    } else {
      delete answerBlock.explanation
    }
  } else {
    answerBlock.text = answerText
    delete answerBlock.explanation
  }
  answerBlock.media = []

  await saveTextbookJson(jsonFilePath, payload)

  return {
    message: 'success',
    jsonFilePath,
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
