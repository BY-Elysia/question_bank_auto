import type { Response } from 'express'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  ARK_API_KEY,
  ARK_BASE_URL,
  ARK_MODEL,
  ARK_RETRY_DELAY_MS,
  ARK_RETRY_TIMES,
  ARK_TIMEOUT_MS,
  MERGED_JSON_DIR,
  MAX_PENDING_QUEUE_PAGES,
  OUTPUT_DIR,
  OUTPUT_JSON_DIR,
  READ_RESULTS_DIR,
  UPLOAD_DIR,
} from './config'
import { getArkApiKeyOverride } from './ark-request-context'
import {
  getChapterSession,
  getQuestionSession,
  setChapterSession,
  setQuestionSession,
} from './state'
import { readUploadedFileBuffer } from './upload'
import type {
  AnswerHandlingMode,
  ChapterDetectResult,
  ChapterItem,
  ChapterSessionState,
  CombinedExtractResult,
  DocumentType,
  LastQuestionLookaheadResult,
  QuestionBoundaryResult,
  QuestionExtractResult,
  QuestionGroup,
  QuestionGroupChild,
  QuestionItem,
  QuestionLeaf,
  QuestionOption,
  QuestionRubricItem,
  QuestionSessionState,
  QuestionTextBlock,
  RangeMismatchCheckResult,
  TextbookJsonPayload,
} from './types'

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function sanitizeFolderName(name: string) {
  return name
    .replace(/[^\p{L}\p{N}_-]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function batchId() {
  const now = new Date()
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const rand = Math.random().toString(16).slice(2, 10)
  return `${ts}_${rand}`
}

function parsePageIndex(fileName: string) {
  const match = fileName.match(/(?:-|_)(\d+)\.(?:jpg|jpeg)$/i)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function normalizeTitle(value: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeJsonPath(filePath: string) {
  return path.resolve(String(filePath || '').trim())
}

function parseNumericSuffix(value: string, pattern: RegExp) {
  const match = value.match(pattern)
  return match ? Number(match[1]) : 0
}

function parseChineseNumberToken(rawToken: string) {
  const token = String(rawToken || '').trim()
  if (!token) return 0
  if (/^\d+$/.test(token)) return Number(token)
  const map: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  let total = 0
  let current = 0
  for (const ch of token) {
    if (map[ch] !== undefined) {
      current = map[ch]
      continue
    }
    if (ch === '十') {
      total += (current || 1) * 10
      current = 0
      continue
    }
    if (ch === '百') {
      total += (current || 1) * 100
      current = 0
      continue
    }
    if (ch === '千') {
      total += (current || 1) * 1000
      current = 0
      continue
    }
  }
  return total + current
}

function extractChapterNoFromTitle(titleInput: string) {
  const title = normalizeDigits(normalizeTitle(titleInput))
  const digitMatch = title.match(/第\s*(\d+)\s*章/)
  if (digitMatch?.[1]) return Number(digitMatch[1])
  const zhMatch = title.match(/第\s*([零一二两三四五六七八九十百千]+)\s*章/)
  if (zhMatch?.[1]) return parseChineseNumberToken(zhMatch[1])
  return 0
}

function extractSectionSuffixFromTitle(titleInput: string) {
  const title = normalizeDigits(normalizeTitle(titleInput))
  const explicit = title.match(/(\d+)\s*[._．。]\s*(\d+)/)
  if (explicit?.[1] && explicit?.[2]) {
    return { chapterNo: Number(explicit[1]), sectionNo: Number(explicit[2]) }
  }
  return { chapterNo: 0, sectionNo: 0 }
}

function ensureTopChapter(payload: TextbookJsonPayload, titleInput: string) {
  const title = normalizeTitle(titleInput)
  const existing = payload.chapters.find((item) => item.parentId === null && normalizeTitle(item.title) === title)
  if (existing) {
    return existing
  }
  const topItems = payload.chapters.filter((item) => item.parentId === null)
  const maxOrder = topItems.reduce((max, item) => Math.max(max, Number(item.orderNo) || 0), 0)
  const maxIdNum = topItems.reduce((max, item) => Math.max(max, parseNumericSuffix(item.chapterId, /^ch_(\d+)$/)), 0)
  const parsedChapterNo = extractChapterNoFromTitle(title)
  const chapterNo = parsedChapterNo > 0 ? parsedChapterNo : maxIdNum + 1
  const created: ChapterItem = {
    chapterId: `ch_${chapterNo}`,
    parentId: null,
    title,
    orderNo: parsedChapterNo > 0 ? parsedChapterNo : maxOrder + 1,
  }
  payload.chapters.push(created)
  return created
}

function ensureSectionChapter(payload: TextbookJsonPayload, parentChapterId: string, titleInput: string) {
  const title = normalizeTitle(titleInput)
  const existing = payload.chapters.find(
    (item) => item.parentId === parentChapterId && normalizeTitle(item.title) === title,
  )
  if (existing) {
    return existing
  }
  const siblings = payload.chapters.filter((item) => item.parentId === parentChapterId)
  const maxOrder = siblings.reduce((max, item) => Math.max(max, Number(item.orderNo) || 0), 0)
  const chapterNo = parseNumericSuffix(parentChapterId, /^ch_(\d+)$/) || 1
  const siblingPattern = new RegExp(`^ch_${chapterNo}_(\\d+)$`)
  const maxSiblingNo = siblings.reduce((max, item) => Math.max(max, parseNumericSuffix(item.chapterId, siblingPattern)), 0)
  const parsedSection = extractSectionSuffixFromTitle(title)
  const sectionNo =
    parsedSection.chapterNo === chapterNo && parsedSection.sectionNo > 0
      ? parsedSection.sectionNo
      : maxSiblingNo + 1
  const created: ChapterItem = {
    chapterId: `ch_${chapterNo}_${sectionNo}`,
    parentId: parentChapterId,
    title,
    orderNo: parsedSection.chapterNo === chapterNo && parsedSection.sectionNo > 0 ? parsedSection.sectionNo : maxOrder + 1,
  }
  payload.chapters.push(created)
  return created
}

function extractFirstJsonObject(rawText: string) {
  const direct = rawText.trim()
  if (direct.startsWith('{') && direct.endsWith('}')) {
    return direct
  }
  const fenced = rawText.match(/```json\s*([\s\S]*?)\s*```/i) || rawText.match(/```\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }
  const first = rawText.indexOf('{')
  const last = rawText.lastIndexOf('}')
  if (first !== -1 && last !== -1 && first < last) {
    return rawText.slice(first, last + 1).trim()
  }
  return ''
}

function fixInvalidJsonEscapes(input: string) {
  // Keep valid JSON escapes, only escape invalid backslash sequences such as "\l", "\s", "\q".
  return input.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
}

function removeTrailingCommas(input: string) {
  return input.replace(/,\s*([}\]])/g, '$1')
}

function sanitizeJsonStringContent(input: string) {
  let output = ''
  let inString = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]

    if (!inString) {
      output += ch
      if (ch === '"') {
        inString = true
      }
      continue
    }

    if (ch === '"') {
      output += ch
      inString = false
      continue
    }

    if (ch === '\\') {
      const next = input[i + 1] || ''
      if (/["\\/bfnrt]/.test(next)) {
        output += `\\${next}`
        i += 1
        continue
      }
      if (next === 'u') {
        const hex = input.slice(i + 2, i + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          output += `\\u${hex}`
          i += 5
          continue
        }
      }
      // Invalid escape start in string, convert "\" into "\\"
      output += '\\\\'
      continue
    }

    if (ch === '\n') {
      output += '\\n'
      continue
    }
    if (ch === '\r') {
      output += '\\r'
      continue
    }
    if (ch === '\t') {
      output += '\\t'
      continue
    }

    const code = ch.charCodeAt(0)
    if (code < 0x20) {
      output += ' '
      continue
    }
    output += ch
  }

  return output
}

function parseModelJsonObject(jsonText: string) {
  const candidates = [
    jsonText,
    fixInvalidJsonEscapes(jsonText),
    removeTrailingCommas(jsonText),
    removeTrailingCommas(fixInvalidJsonEscapes(jsonText)),
    sanitizeJsonStringContent(jsonText),
    removeTrailingCommas(sanitizeJsonStringContent(jsonText)),
    sanitizeJsonStringContent(removeTrailingCommas(fixInvalidJsonEscapes(jsonText))),
  ]
  const errors: string[] = []

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  const preview = jsonText.slice(0, 600)
  throw new Error(`Model JSON parse failed. ${errors.join(' | ')}; preview=${preview}`)
}

function toRubric(value: unknown): QuestionRubricItem[] {
  const items = Array.isArray(value) ? value : []
  const normalized = items
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const criteria = typeof row.criteria === 'string' ? row.criteria : ''
      const maxScoreRaw = Number(row.maxScore)
      const maxScore = Number.isFinite(maxScoreRaw) ? maxScoreRaw : 0
      return {
        rubricItemKey: typeof row.rubricItemKey === 'string' && row.rubricItemKey.trim() ? row.rubricItemKey : `key_${index + 1}`,
        maxScore,
        criteria,
      }
    })
    .filter(Boolean) as QuestionRubricItem[]

  if (!normalized.length) {
    return [
      { rubricItemKey: 'key_1', maxScore: 5, criteria: '关键步骤正确' },
      { rubricItemKey: 'key_2', maxScore: 5, criteria: '结论正确' },
    ]
  }

  const total = normalized.reduce((sum, item) => sum + item.maxScore, 0)
  if (total !== 10) {
    const adjusted = [...normalized]
    const delta = 10 - total
    adjusted[adjusted.length - 1] = {
      ...adjusted[adjusted.length - 1],
      maxScore: adjusted[adjusted.length - 1].maxScore + delta,
    }
    return adjusted
  }
  return normalized
}

const QUESTION_TYPE_OPTIONS = [
  {
    value: 'SHORT_ANSWER',
    label: '填空/简答题',
    aliases: ['填空题', '简答题'],
  },
  {
    value: 'PROOF',
    label: '证明题',
    aliases: ['证明题'],
  },
  {
    value: 'CALCULATION',
    label: '计算题',
    aliases: ['计算题', '解答题'],
  },
  {
    value: 'CODE',
    label: '编程题',
    aliases: ['编程题', '程序题', '代码题'],
  },
  {
    value: 'SINGLE_CHOICE',
    label: '单选题',
    aliases: ['单选题', '单项选择题', '选择题'],
  },
  {
    value: 'MULTI_CHOICE',
    label: '多选题',
    aliases: ['多选题', '多项选择题', '不定项选择题'],
  },
  {
    value: 'JUDGE',
    label: '判断题',
    aliases: ['判断题'],
  },
] as const

function normalizeQuestionType(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) {
    return 'SHORT_ANSWER'
  }
  const upper = raw.toUpperCase()
  if (upper === 'PROGRAMMING' || upper === 'CODE') {
    return 'CODE'
  }
  if (QUESTION_TYPE_OPTIONS.some((option) => option.value === upper)) {
    return upper
  }
  if (/编程|程序|代码/.test(raw)) return 'CODE'
  if (/多项|多选|不定项/.test(raw)) return 'MULTI_CHOICE'
  if (/单项|单选|选择/.test(raw)) return 'SINGLE_CHOICE'
  if (/判断/.test(raw)) return 'JUDGE'
  if (/证明/.test(raw)) return 'PROOF'
  if (/计算|解答|求解|求/.test(raw)) return 'CALCULATION'
  if (/填空|简答|问答/.test(raw)) return 'SHORT_ANSWER'
  return 'SHORT_ANSWER'
}

function normalizeChapterId(value: unknown, fallbackChapterId: string) {
  const raw = normalizeDigits(String(value || '').trim())
  if (!raw) return fallbackChapterId
  if (raw.startsWith('ch_')) return raw
  const numeric = raw
    .replace(/[^\d_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return numeric ? `ch_${numeric}` : fallbackChapterId
}

function chapterSuffixFromChapterId(chapterId: string) {
  const raw = normalizeDigits(String(chapterId || ''))
  const body = raw.startsWith('ch_') ? raw.slice(3) : raw
  const tokens = body
    .split('_')
    .map((token) => token.replace(/[^\d]/g, ''))
    .filter(Boolean)
  if (tokens.length >= 2) {
    return `${tokens[0]}_${tokens[1]}`
  }
  if (tokens.length === 1) {
    return `${tokens[0]}_0`
  }
  return '0_0'
}

function sanitizeStandardAnswerText(value: string) {
  const lines = String(value || '').split(/\r?\n/)
  const filtered = lines.filter((line) => {
    const text = line.trim()
    if (!text) return true
    if (/^(思路(分析)?|归纳(总结)?|总结|方法总结|解题思路|拓展|延伸|小结)\s*[:：]/.test(text)) {
      return false
    }
    if (/^(由此可归纳|综上可归纳|总结如下)/.test(text)) {
      return false
    }
    return true
  })
  return filtered.join('\n')
}

function normalizeMediaItems(media: Array<Record<string, unknown>>, questionId: string) {
  const idSuffix = questionId.replace(/^q_/, '')
  return media.map((item, index) => {
    const caption = typeof item.caption === 'string' ? item.caption : ''
    const rawUrl = typeof item.url === 'string' ? item.url.trim() : ''
    const urlSuffix = index === 0 ? '' : `_${index + 1}`
    const preservedUrl =
      rawUrl.startsWith('/workspace-assets/')
      || rawUrl.startsWith('/uploads/')
      || rawUrl.startsWith('data:')
        ? rawUrl
        : ''
    return {
      type: 'image',
      url: preservedUrl || `https://${idSuffix}${urlSuffix}.png`,
      caption,
      orderNo: Number.isFinite(Number(item.orderNo)) && Number(item.orderNo) > 0 ? Number(item.orderNo) : index + 1,
      ...(Number.isFinite(Number(item.sourcePageIndex)) && Number(item.sourcePageIndex) > 0
        ? { sourcePageIndex: Number(item.sourcePageIndex) }
        : {}),
      ...(Number.isFinite(Number(item.x1)) ? { x1: Number(item.x1) } : {}),
      ...(Number.isFinite(Number(item.y1)) ? { y1: Number(item.y1) } : {}),
      ...(Number.isFinite(Number(item.x2)) ? { x2: Number(item.x2) } : {}),
      ...(Number.isFinite(Number(item.y2)) ? { y2: Number(item.y2) } : {}),
      ...(item.crop && typeof item.crop === 'object' ? { crop: item.crop } : {}),
    } as Record<string, unknown>
  })
}

function toTextBlock(
  value: unknown,
  questionIdForMedia: string,
  isStandardAnswer = false,
  forceEmpty = false,
): QuestionTextBlock {
  if (forceEmpty) {
    return { text: '', media: [] }
  }
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const sourceText = typeof raw.text === 'string' ? raw.text : ''
  const text = isStandardAnswer ? sanitizeStandardAnswerText(sourceText) : sourceText
  const mediaRaw = Array.isArray(raw.media)
    ? (raw.media.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>)
    : []
  const media = normalizeMediaItems(mediaRaw, questionIdForMedia)
  return { text, media }
}

function isChoiceQuestionType(questionType: string) {
  return questionType === 'SINGLE_CHOICE' || questionType === 'MULTI_CHOICE'
}

function normalizeChoiceOptionId(value: unknown) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^[\[\(（【]\s*/, '')
    .replace(/\s*[\]\)）】]$/, '')
  return /^[A-Z]$/.test(normalized) ? normalized : ''
}

function normalizeExplicitChoiceOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as QuestionOption[]
  }

  const options: QuestionOption[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as Record<string, unknown>
    const id = normalizeChoiceOptionId(row.id)
    const text = String(row.text || '').trim()
    if (!id || !text || seen.has(id)) {
      continue
    }
    seen.add(id)
    options.push({ id, text })
  }
  return options
}

function parseEmbeddedChoiceOptions(promptText: string) {
  const lines = String(promptText || '').split(/\r?\n/)
  const optionPattern =
    /^\s*(?:[\[\(（【]\s*([A-Za-z])\s*[\]\)）】]|([A-Za-z])\s*[.．、:：\)）])\s*(.+?)\s*$/
  const options: QuestionOption[] = []
  let firstOptionIndex = -1
  let currentOption: QuestionOption | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(optionPattern)
    if (match) {
      const id = normalizeChoiceOptionId(match[1] || match[2])
      const text = String(match[3] || '').trim()
      if (id && text) {
        if (firstOptionIndex < 0) {
          firstOptionIndex = index
        }
        currentOption = { id, text }
        options.push(currentOption)
        continue
      }
    }

    if (currentOption && index > firstOptionIndex) {
      const continuation = line.trim()
      if (continuation) {
        currentOption.text = `${currentOption.text}\n${continuation}`
      }
    }
  }

  const uniqueOptions = options.filter(
    (option, index) => options.findIndex((candidate) => candidate.id === option.id) === index,
  )
  if (firstOptionIndex < 0 || uniqueOptions.length < 2) {
    return {
      promptText,
      options: [] as QuestionOption[],
    }
  }

  return {
    promptText: lines.slice(0, firstOptionIndex).join('\n').trimEnd(),
    options: uniqueOptions,
  }
}

function normalizeChoicePromptAndOptions(
  rawOptions: unknown,
  prompt: QuestionTextBlock,
) {
  const explicitOptions = normalizeExplicitChoiceOptions(rawOptions)
  const parsed = parseEmbeddedChoiceOptions(prompt.text)
  return {
    prompt: {
      ...prompt,
      text: parsed.options.length ? parsed.promptText : prompt.text,
    },
    options: explicitOptions.length ? explicitOptions : parsed.options,
  }
}

function splitChoiceOptionIds(value: string) {
  return String(value || '')
    .split(/[\s,，、/]+/)
    .map(normalizeChoiceOptionId)
    .filter(Boolean)
}

function parseChoiceAnswerText(value: string) {
  const text = String(value || '').trim()
  if (!text) {
    return {
      optionIds: [] as string[],
      answerText: '',
      explanation: '',
    }
  }

  const directMatch = text.match(
    /^(?:答案|正确答案)\s*[:：]?\s*([\[\(（【]?[A-Za-z][\]\)）】]?(?:\s*[,，、/]\s*[\[\(（【]?[A-Za-z][\]\)）】]?)*)\s*(?:\r?\n|$)/i,
  )
  const plainMatch =
    directMatch ||
    text.match(
      /^([\[\(（【]?[A-Za-z][\]\)）】]?(?:\s*[,，、/]\s*[\[\(（【]?[A-Za-z][\]\)）】]?)*)\s*(?:\r?\n|$)/i,
    )
  const firstLineMatch = plainMatch?.[0] || ''
  const optionIdsFromFirstLine = splitChoiceOptionIds(plainMatch?.[1] || '')
  const tail = firstLineMatch ? text.slice(firstLineMatch.length).trim() : ''
  const tailWithoutLabel = tail.replace(/^(?:解析|解答|说明)\s*[:：]?\s*/i, '').trim()

  if (optionIdsFromFirstLine.length) {
    return {
      optionIds: optionIdsFromFirstLine,
      answerText: optionIdsFromFirstLine.join(','),
      explanation: tailWithoutLabel,
    }
  }

  const inlineMatch = text.match(
    /(?:正确答案|答案)\s*(?:为|是)?\s*[:：]?\s*(?:[*_]{0,2})?[\[\(（【]?\s*([A-Za-z])\s*[\]\)）】]?(?:[*_]{0,2})?/i,
  )
  const inlineIds = splitChoiceOptionIds(inlineMatch?.[1] || '')
  return {
    optionIds: inlineIds,
    answerText: inlineIds.join(','),
    explanation: inlineIds.length ? text : '',
  }
}

function normalizeCorrectOptionIds(
  rawValue: unknown,
  fallbackOptionIds: string[],
  questionType: string,
  forceEmpty: boolean,
) {
  if (forceEmpty) {
    return [] as string[]
  }

  const sourceValues = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === 'string'
      ? rawValue.split(/[\s,，、/]+/)
      : []
  const normalized = sourceValues
    .map(normalizeChoiceOptionId)
    .filter((item, index, rows) => Boolean(item) && rows.indexOf(item) === index)
  const candidateIds = normalized.length ? normalized : fallbackOptionIds
  return questionType === 'SINGLE_CHOICE' ? candidateIds.slice(0, 1) : candidateIds
}

function normalizeChoiceStandardAnswer(
  rawValue: unknown,
  fallbackBlock: QuestionTextBlock,
  questionType: string,
  correctOptionIds: string[],
  forceEmpty: boolean,
) {
  if (forceEmpty) {
    return fallbackBlock
  }

  const raw = rawValue && typeof rawValue === 'object' ? (rawValue as Record<string, unknown>) : {}
  const parsed = parseChoiceAnswerText(fallbackBlock.text)
  const normalizedIds = correctOptionIds.length ? correctOptionIds : parsed.optionIds
  const answerText =
    questionType === 'SINGLE_CHOICE'
      ? normalizedIds[0] || parsed.answerText || fallbackBlock.text.trim()
      : normalizedIds.join(',') || parsed.answerText || fallbackBlock.text.trim()
  const explicitExplanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''
  const explanation = explicitExplanation || parsed.explanation

  return {
    text: answerText,
    media: fallbackBlock.media,
    ...(explanation ? { explanation } : {}),
  }
}

function normalizePersistedChoiceQuestionLike(host: Record<string, unknown>) {
  const questionType = normalizeQuestionType(host.questionType)
  if (!isChoiceQuestionType(questionType)) {
    return
  }

  const promptRaw = host.prompt && typeof host.prompt === 'object'
    ? (host.prompt as Record<string, unknown>)
    : {}
  const prompt = {
    text: typeof promptRaw.text === 'string' ? promptRaw.text : '',
    media: Array.isArray(promptRaw.media)
      ? (promptRaw.media.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>)
      : [],
  }
  const choice = normalizeChoicePromptAndOptions(host.options, prompt)

  const answerRaw = host.standardAnswer && typeof host.standardAnswer === 'object'
    ? (host.standardAnswer as Record<string, unknown>)
    : {}
  const answerBlock = {
    text: typeof answerRaw.text === 'string' ? sanitizeStandardAnswerText(answerRaw.text) : '',
    media: Array.isArray(answerRaw.media)
      ? (answerRaw.media.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>)
      : [],
  }
  const parsedAnswer = parseChoiceAnswerText(answerBlock.text)
  const correctOptionIds = normalizeCorrectOptionIds(
    host.correctOptionIds,
    parsedAnswer.optionIds,
    questionType,
    false,
  )

  host.questionType = questionType
  host.prompt = choice.prompt
  host.options = choice.options
  host.correctOptionIds = correctOptionIds
  host.allowPartial = questionType === 'SINGLE_CHOICE' ? false : host.allowPartial === true
  host.standardAnswer = normalizeChoiceStandardAnswer(
    host.standardAnswer,
    answerBlock,
    questionType,
    correctOptionIds,
    false,
  )
}

function normalizePersistedChoiceQuestionShapes(payload: TextbookJsonPayload) {
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  for (const item of questions) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const question = item as Record<string, unknown>
    if (String(question.nodeType || '').trim().toUpperCase() === 'GROUP') {
      const children = Array.isArray(question.children) ? question.children : []
      for (const child of children) {
        if (child && typeof child === 'object') {
          normalizePersistedChoiceQuestionLike(child as Record<string, unknown>)
        }
      }
      continue
    }
    normalizePersistedChoiceQuestionLike(question)
  }
}

function normalizeQuestionId(value: unknown, chapterId: string, questionNo: string, childNo?: string) {
  const chapterSuffix = chapterSuffixFromChapterId(chapterId)
  const mainNo = questionNo || '0'
  if (childNo && String(childNo).trim()) {
    return `q_${chapterSuffix}_${mainNo}_${String(childNo).trim()}`
  }
  const raw = normalizeDigits(String(value || '').trim())
  if (raw.startsWith('q_')) {
    const body = raw
      .slice(2)
      .replace(/[^\d_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (body) {
      const bodyTokens = body.split('_').filter(Boolean)
      const expectedTokens = chapterSuffix.split('_').filter(Boolean)
      const hasMatchingChapterPrefix = expectedTokens.every((token, index) => bodyTokens[index] === token)
      return hasMatchingChapterPrefix ? `q_${body}` : `q_${chapterSuffix}_${mainNo}`
    }
  }
  return `q_${chapterSuffix}_${mainNo}`
}

function normalizeDigits(value: string) {
  return value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248))
}

function extractQuestionNoFromText(value: string) {
  const normalized = normalizeDigits(String(value || ''))
  const byTitle = normalized.match(/第\s*(\d+)\s*题/)
  if (byTitle?.[1]) return byTitle[1]
  const byAnyNumber = normalized.match(/(\d+)/)
  return byAnyNumber?.[1] || ''
}

function extractQuestionNoFromId(questionId: string) {
  const normalized = normalizeDigits(String(questionId || ''))
  const match = normalized.match(/^q_(\d+)_(\d+)_(\d+)/)
  if (match?.[3]) return match[3]
  const fallback = normalized.match(/(\d+)(?!.*\d)/)
  if (fallback?.[1]) return fallback[1]
  return ''
}

function extractQuestionNoFromPrompt(promptText: string) {
  const normalized = normalizeDigits(String(promptText || ''))
  const match = normalized.match(/^\s*[\(（]?(\d+)[\)）]?/)
  return match?.[1] || ''
}

function resolveContinueQuestionKey(continueQuestionKey: string | null) {
  const direct = String(continueQuestionKey || '').trim()
  if (direct) return direct
  return ''
}

function readQuestionKeyField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function normalizeQuestionKeyForCompare(value: string | null) {
  return normalizeDigits(String(value || ''))
    .split('|')
    .map((part) => normalizeTitle(part))
    .filter(Boolean)
    .join('|')
}

function extractSectionTitleFromContinueQuestionKey(value: string | null) {
  const parts = String(value || '')
    .split('|')
    .map((part) => normalizeTitle(part))
    .filter(Boolean)
  return parts.length >= 3 ? parts[1] : ''
}

function shouldAcceptLookaheadContinueQuestionKey(params: {
  lookaheadTailQuestionKey: string | null
  boundaryQueueTailQuestionKey: string | null
  lookaheadContinueKey: string | null
  boundaryContinueKey: string | null
  boundaryReason: string
  currentSectionTitle: string
}) {
  const boundaryQueueTailQuestionKey = resolveContinueQuestionKey(params.boundaryQueueTailQuestionKey)
  const lookaheadTailQuestionKey = resolveContinueQuestionKey(params.lookaheadTailQuestionKey)
  if (boundaryQueueTailQuestionKey && !lookaheadTailQuestionKey) {
    return {
      accepted: false,
      reason: `预读助手没有返回正式队列尾题；忽略预读结果，避免预读页污染当前队列。`,
    }
  }

  if (
    boundaryQueueTailQuestionKey
    && lookaheadTailQuestionKey
    && normalizeQuestionKeyForCompare(boundaryQueueTailQuestionKey) !== normalizeQuestionKeyForCompare(lookaheadTailQuestionKey)
  ) {
    return {
      accepted: false,
      reason:
        `预读助手复核出的正式队列尾题为“${lookaheadTailQuestionKey}”，但边界助手尾题为“${boundaryQueueTailQuestionKey}”；需要重判，预读页不能参与确定正式队列尾题。`,
    }
  }

  const lookaheadContinueKey = resolveContinueQuestionKey(params.lookaheadContinueKey)
  if (!lookaheadContinueKey) {
    return { accepted: true, reason: '' }
  }

  if (
    boundaryQueueTailQuestionKey
    && normalizeQuestionKeyForCompare(lookaheadContinueKey) !== normalizeQuestionKeyForCompare(boundaryQueueTailQuestionKey)
  ) {
    return {
      accepted: false,
      reason:
        `预读续题指向“${lookaheadContinueKey}”，但它不是边界助手确认的正式队列尾题“${boundaryQueueTailQuestionKey}”；忽略预读结果。`,
    }
  }

  const lookaheadQuestionNo = Number(extractQuestionNoFromText(lookaheadContinueKey) || 0)
  const boundaryQuestionNos = extractDistinctQuestionNos(params.boundaryReason)
  const maxBoundaryQuestionNo = boundaryQuestionNos.length ? Math.max(...boundaryQuestionNos) : 0
  const boundaryContinueQuestionNo = Number(extractQuestionNoFromText(params.boundaryContinueKey || '') || 0)
  if (
    lookaheadQuestionNo > 0
    && maxBoundaryQuestionNo > 0
    && lookaheadQuestionNo > maxBoundaryQuestionNo
    && lookaheadQuestionNo !== boundaryContinueQuestionNo
  ) {
    return {
      accepted: false,
      reason:
        `预读续题指向第${lookaheadQuestionNo}题，但当前队列边界只确认到第${maxBoundaryQuestionNo}题；忽略预读结果，避免把预读页中的后续题当成当前队列最后题。`,
    }
  }

  const lookaheadSectionTitle = extractSectionTitleFromContinueQuestionKey(lookaheadContinueKey)
  if (!lookaheadSectionTitle) {
    return { accepted: true, reason: '' }
  }

  const currentSectionTitle = normalizeTitle(params.currentSectionTitle)
  if (normalizeTitle(lookaheadSectionTitle) === currentSectionTitle) {
    return { accepted: true, reason: '' }
  }

  const boundarySectionTitle = extractSectionTitleFromContinueQuestionKey(params.boundaryContinueKey)
  if (boundarySectionTitle && normalizeTitle(boundarySectionTitle) === normalizeTitle(lookaheadSectionTitle)) {
    return { accepted: true, reason: '' }
  }

  return {
    accepted: false,
    reason:
      `预读续题指向小节“${lookaheadSectionTitle}”，但当前队列边界判断未确认该小节；忽略预读结果，避免下一页小节提前污染当前页。`,
  }
}

function extractDistinctQuestionNos(value: string) {
  const normalized = normalizeDigits(String(value || ''))
  const nums: number[] = []
  for (const match of normalized.matchAll(/第\s*([\d\s、,，和及至到\-~～]+)\s*题/g)) {
    const raw = match[1] || ''
    for (const numMatch of raw.matchAll(/\d+/g)) {
      const num = Number(numMatch[0])
      if (Number.isFinite(num) && num > 0) {
        nums.push(num)
      }
    }
  }
  return [...new Set(nums)]
}

function topQuestionNosFromItems(items: QuestionItem[]) {
  return [...new Set(
    items
      .map((item) => Number(extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title) || 0))
      .filter((num) => Number.isFinite(num) && num > 0),
  )].sort((a, b) => a - b)
}

function detectExtractorRangeMismatch(params: {
  boundaryReason: string
  processingStartQuestionKey: string | null
  extractEndBeforeQuestionKey: string | null
  extractReason?: string
  normalizedQuestions: QuestionItem[]
}) {
  const {
    boundaryReason,
    processingStartQuestionKey,
    extractEndBeforeQuestionKey,
    extractReason = '',
    normalizedQuestions,
  } = params

  if (extractEndBeforeQuestionKey) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }

  const startNo = Number(extractQuestionNoFromText(processingStartQuestionKey || '') || 0)
  if (!startNo) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }

  const boundaryNos = extractDistinctQuestionNos(boundaryReason).filter((num) => num >= startNo)
  const returnedNos = topQuestionNosFromItems(normalizedQuestions)
  if (!boundaryNos.length || !returnedNos.length) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }

  const onlyReturnedStart = returnedNos.length === 1 && returnedNos[0] === startNo
  const boundaryMentionsLaterQuestion = boundaryNos.some((num) => num > startNo)
  if (onlyReturnedStart && boundaryMentionsLaterQuestion) {
    return {
      shouldRetry: true,
      reason: `边界判断认为起点题之后仍有完整题可提取（${boundaryNos.join(', ')}），但提取结果只返回了起点题第${startNo}题。`,
    }
  }

  const extractReasonNormalized = normalizeDigits(String(extractReason || ''))
  if (
    !extractEndBeforeQuestionKey &&
    onlyReturnedStart &&
    /截止题号.*第\s*\d+\s*题/.test(extractReasonNormalized)
  ) {
    return {
      shouldRetry: true,
      reason: `第二助手在 endBeforeQuestionKey=null 的情况下，仍把截止题号解释成了起点题第${startNo}题。`,
    }
  }

  return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
}

function detectBoundaryReasonScopeMismatch(params: {
  boundaryReason: string
  processingStartQuestionKey: string | null
}) {
  const { boundaryReason, processingStartQuestionKey } = params
  const startNo = Number(extractQuestionNoFromText(processingStartQuestionKey || '') || 0)
  if (!startNo) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }
  const boundaryNos = extractDistinctQuestionNos(boundaryReason)
  const earlierNos = boundaryNos.filter((num) => num > 0 && num < startNo)
  if (!earlierNos.length) {
    return { shouldRetry: false, reason: '' } as RangeMismatchCheckResult
  }
  return {
    shouldRetry: true,
    reason: `当前处理起点已是第${startNo}题，但边界理由仍提到了起点之前的题号（${earlierNos.join(', ')}），说明边界判断没有严格按起点范围作答。`,
  } as RangeMismatchCheckResult
}

function excludePendingQuestionItems(items: QuestionItem[], continueKey: string) {
  if (!continueKey) {
    return { filtered: items, droppedCount: 0 }
  }
  const normalizedKey = normalizeDigits(continueKey).replace(/\s+/g, '')
  const continueNo = Number(extractQuestionNoFromText(continueKey) || 0)
  const matchedIndex = items.findIndex((item) => matchesContinueKey(item, continueKey))
  if (matchedIndex !== -1) {
    return {
      filtered: items.slice(0, matchedIndex),
      droppedCount: Math.max(0, items.length - matchedIndex),
    }
  }
  const filtered = items.filter((item) => {
    const itemNo = Number(extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title) || 0)
    if (continueNo && itemNo && itemNo >= continueNo) {
      return false
    }
    const compactTitle = normalizeDigits(item.title || '').replace(/\s+/g, '')
    if (compactTitle && normalizedKey && compactTitle.includes(normalizedKey)) {
      return false
    }
    return true
  })
  return {
    filtered,
    droppedCount: Math.max(0, items.length - filtered.length),
  }
}

function filterQuestionItemsByRange(params: {
  items: QuestionItem[]
  startQuestionKey?: string | null
  endQuestionKeyExclusive?: string | null
}) {
  const { items, startQuestionKey = null, endQuestionKeyExclusive = null } = params
  const startNo = Number(extractQuestionNoFromText(startQuestionKey || '') || 0)
  const endNo = Number(extractQuestionNoFromText(endQuestionKeyExclusive || '') || 0)
  if (!startNo && !endNo) {
    return { filtered: items, droppedCount: 0 }
  }
  const filtered = items.filter((item) => {
    const itemNo = Number(extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title) || 0)
    if (!itemNo) return false
    if (startNo && itemNo < startNo) return false
    if (endNo && itemNo >= endNo) return false
    return true
  })
  return {
    filtered,
    droppedCount: Math.max(0, items.length - filtered.length),
  }
}

function isLikelyCodeQuestionText(value: string) {
  const text = normalizeDigits(String(value || '')).toLowerCase()
  return /(编程|代码|程序|算法实现|写程序|编写程序|实现算法|python|java|javascript|typescript|c\+\+|c语言|matlab|sql|伪代码)/.test(text)
}

function shouldAllowBlankGeneratedAnswer(item: QuestionItem) {
  if (item.nodeType === 'GROUP') {
    const combined = [item.title, item.stem.text, ...item.children.map((child) => child.prompt.text)].join('\n')
    return isLikelyCodeQuestionText(combined)
  }
  return isLikelyCodeQuestionText([item.title, item.prompt.text].join('\n'))
}

function isLikelyIncompleteForQueue(item: QuestionItem, expectAnswer = true, allowBlankCodeAnswer = false) {
  if (!expectAnswer) {
    return false
  }
  if (allowBlankCodeAnswer && shouldAllowBlankGeneratedAnswer(item)) {
    return false
  }
  if (item.nodeType === 'GROUP') {
    const answeredCount = item.children.filter((child) => child.standardAnswer.text.trim()).length
    const emptyAnsweredChildren = item.children.filter(
      (child) => child.prompt.text.trim() && !child.standardAnswer.text.trim(),
    )
    return answeredCount > 0 && emptyAnsweredChildren.length > 0
  }
  return Boolean(item.prompt.text.trim() && !item.standardAnswer.text.trim())
}

function childQuestionNo(child: QuestionGroupChild) {
  return (
    Number(extractQuestionNoFromId(child.questionId) || 0) ||
    Number(extractQuestionNoFromPrompt(child.prompt.text) || 0) ||
    Number(child.orderNo) ||
    0
  )
}

function isLikelyTruncatedAnswerText(text: string) {
  const value = String(text || '').trim()
  if (!value) return false
  if (/[=+\-*/,:：，、(（[{]$/.test(value)) return true
  const leftParen = (value.match(/[([{（]/g) || []).length
  const rightParen = (value.match(/[)\]}）]/g) || []).length
  if (leftParen > rightParen) return true
  return /(所以|则|得|即|因此|于是|从而)$/.test(value)
}

function detectQuestionIntegrityIssue(items: QuestionItem[], options?: { expectAnswer?: boolean; allowBlankCodeAnswer?: boolean }) {
  const expectAnswer = options?.expectAnswer !== false
  const allowBlankCodeAnswer = options?.allowBlankCodeAnswer === true
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item.nodeType === 'GROUP') {
      const childNos = item.children
        .map((child) => childQuestionNo(child))
        .filter((value) => value > 0)
      const uniqueSortedNos = [...new Set(childNos)].sort((a, b) => a - b)
      if (
        uniqueSortedNos.length >= 3 &&
        uniqueSortedNos[0] === 1 &&
        uniqueSortedNos[uniqueSortedNos.length - 1] - uniqueSortedNos[0] + 1 !== uniqueSortedNos.length
      ) {
        return {
          index,
          continueKey: item.title || questionDisplayKey(item),
          reason: `${item.title || questionDisplayKey(item)} 子题序号不连续，判定为提取不完整，继续等待重试或后续页面。`,
        }
      }
      if (isLikelyIncompleteForQueue(item, expectAnswer, allowBlankCodeAnswer)) {
        return {
          index,
          continueKey: item.title || questionDisplayKey(item),
          reason: `${item.title || questionDisplayKey(item)} 仍有小问答案未完整显示，继续等待后续页面。`,
        }
      }
      const truncatedChild = item.children.find((child) => isLikelyTruncatedAnswerText(child.standardAnswer.text))
      if (truncatedChild) {
        return {
          index,
          continueKey: item.title || questionDisplayKey(item),
          reason: `${item.title || questionDisplayKey(item)} 的答案尾部未闭合，判定为未完整结束。`,
        }
      }
      continue
    }

    if (
      isLikelyIncompleteForQueue(item, expectAnswer, allowBlankCodeAnswer)
      || isLikelyTruncatedAnswerText(item.standardAnswer.text)
    ) {
      return {
        index,
        continueKey: item.title || questionDisplayKey(item),
        reason: `${item.title || questionDisplayKey(item)} 的答案未完整结束，继续等待后续页面。`,
      }
    }
  }
  return null
}

function detectQuestionEmptyAnswerIssue(
  item: QuestionItem,
  options?: { expectAnswer?: boolean; allowBlankCodeAnswer?: boolean },
) {
  if (options?.expectAnswer === false) {
    return ''
  }
  if (options?.allowBlankCodeAnswer === true && shouldAllowBlankGeneratedAnswer(item)) {
    return ''
  }
  const displayKey = item.title || questionDisplayKey(item)
  if (item.nodeType === 'GROUP') {
    if (!item.children.length) {
      return `${displayKey} 没有提取出任何小问，拒绝写回。`
    }

    const emptyChild = item.children.find(
      (child) => child.prompt.text.trim() && !child.standardAnswer.text.trim(),
    )
    if (emptyChild) {
      const childLabel = Number(emptyChild.orderNo) > 0 ? `第${emptyChild.orderNo}小题` : '某个小题'
      return `${displayKey} 的${childLabel}答案为空，拒绝写回。`
    }
    return ''
  }

  if (item.prompt.text.trim() && !item.standardAnswer.text.trim()) {
    return `${displayKey} 的答案为空，拒绝写回。`
  }
  return ''
}

function trimLikelyIncompleteTail(items: QuestionItem[], options?: { expectAnswer?: boolean }) {
  const expectAnswer = options?.expectAnswer !== false
  const cutIndex = items.findIndex((item) => isLikelyIncompleteForQueue(item, expectAnswer))
  if (cutIndex === -1) {
    return null
  }
  const pendingItem = items[cutIndex]
  const continueKey =
    pendingItem.title ||
    (pendingItem.nodeType === 'GROUP'
      ? `第${extractQuestionNoFromId(pendingItem.questionId)}题`
      : `第${extractQuestionNoFromId(pendingItem.questionId)}题`)
  return {
    filtered: items.slice(0, cutIndex),
    droppedCount: Math.max(0, items.length - cutIndex),
    continueKey,
    reason: `${continueKey}仍有小问答案为空，判定为跨页未完成，继续等待后续页面。`,
  }
}

function matchesContinueKey(item: QuestionItem, continueKey: string) {
  const normalizedKey = normalizeDigits(String(continueKey || '')).replace(/\s+/g, '')
  if (!normalizedKey) return false
  const continueNo = extractQuestionNoFromText(continueKey)
  const itemNo = extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title)
  if (continueNo && itemNo && continueNo === itemNo) {
    return true
  }
  const compactTitle = normalizeDigits(item.title || '').replace(/\s+/g, '')
  return Boolean(compactTitle && compactTitle.includes(normalizedKey))
}

function shouldClearTrailingPendingAfterExtraction(items: QuestionItem[], continueKey: string | null) {
  if (!continueKey || !items.length) {
    return false
  }
  const continueNo = Number(extractQuestionNoFromText(continueKey) || 0)
  if (!continueNo) {
    return false
  }
  const topNos = items
    .map((item) => Number(extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title) || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!topNos.length) {
    return false
  }
  const lastNo = topNos[topNos.length - 1]
  const hasMatched = topNos.includes(continueNo)
  const hasLater = topNos.some((value) => value > continueNo)
  return hasMatched && !hasLater && lastNo === continueNo
}

function buildBoundaryExtractorConflictRetryHint(params: {
  boundaryReason: string
  boundaryRawText?: string
  previousExtractReason?: string
  previousExtractRawText?: string
  processingStartQuestionKey?: string | null
  extractEndBeforeQuestionKey?: string | null
}) {
  const {
    boundaryReason,
    boundaryRawText = '',
    previousExtractReason = '',
    previousExtractRawText = '',
    processingStartQuestionKey = null,
    extractEndBeforeQuestionKey = null,
  } = params

  return [
    '冲突修复：边界判断已经确认当前图片队列中存在可完整入库的题目，但提取器前两轮都返回了空 questionsToUpsert。',
    `startQuestionKey=${processingStartQuestionKey || 'null'}`,
    `endBeforeQuestionKey=${extractEndBeforeQuestionKey || 'null'}`,
    boundaryReason ? `边界判断理由：${boundaryReason}` : '',
    boundaryRawText ? `边界原始输出：${boundaryRawText}` : '',
    previousExtractReason ? `上一轮提取理由：${previousExtractReason}` : '',
    previousExtractRawText ? `上一轮提取原始输出：${previousExtractRawText}` : '',
    '请重新逐张核对图片，并严格按范围输出所有完整顶层大题。',
    '如果 startQuestionKey 不为 null 且 endBeforeQuestionKey 为 null，必须继续提取起点之后所有完整顶层大题，不能只盯着起点题。',
    '只有在你能明确证明当前范围内确实没有任何完整题时，才允许返回空数组；否则必须输出题目。',
  ]
    .filter(Boolean)
    .join(' ')
}

function sameQuestionKey(a: string | null | undefined, b: string | null | undefined) {
  const aNo = extractQuestionNoFromText(String(a || ''))
  const bNo = extractQuestionNoFromText(String(b || ''))
  if (aNo && bNo) return aNo === bNo
  const aNorm = normalizeDigits(String(a || '')).replace(/\s+/g, '')
  const bNorm = normalizeDigits(String(b || '')).replace(/\s+/g, '')
  return Boolean(aNorm && bNorm && aNorm === bNorm)
}

function questionDisplayKey(item: QuestionItem) {
  if (item.title) return item.title
  const questionNo = extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title)
  return questionNo ? `第${questionNo}题` : item.title || item.questionId
}

function findCompletedPendingQuestion(items: QuestionItem[], continueKey: string) {
  const target = items.find((item) => matchesContinueKey(item, continueKey))
  if (!target) return null
  return isLikelyIncompleteForQueue(target) ? null : target
}

function stripLeadingQuestionLabel(title: string) {
  return String(title || '')
    .replace(/^\s*第\s*\d+\s*题[\s.:：、-]*/u, '')
    .replace(/^\s*\d+\s*[.、．。:：-]\s*/u, '')
    .trim()
}

function buildCrossPageContext(params: {
  processingStartQuestionKey: string | null
  pendingContinueQuestionKey: string | null
  pendingReason: string | null
  pendingUpsertedCount: number
  pendingPagesCount: number
  pendingPageLabels?: string[]
}) {
  const {
    processingStartQuestionKey,
    pendingPagesCount,
    pendingPageLabels = [],
  } = params
  return [
    '跨页补充说明:',
    `- 当前处理起点题号: ${processingStartQuestionKey || 'null'}`,
    `- 当前待补队列页数: ${pendingPagesCount}`,
    pendingPageLabels.length ? `- 当前待补队列页文件名: ${pendingPageLabels.join(' + ')}` : '',
    '- 当前请求输入图顺序固定: 前N-1张为待补队列页，最后1张为当前新页。',
    '- 如果当前处理起点题号为 null，则从队列第一页图片中实际出现的第一个题开始。',
    '- 你应先判断“从当前处理起点开始，哪些题已经完整可入库”，再判断“最后一张图的最后一题是否跨页”。',
  ].join(' ')
}

function numberInstructionLines(startNo: number, lines: string[]) {
  return lines.map((line, index) => `${startNo + index}) ${line}`)
}

function resolveAnswerHandlingMode(
  value: boolean | AnswerHandlingMode | undefined,
  fallback: AnswerHandlingMode = 'extract_visible',
): AnswerHandlingMode {
  if (value === 'extract_visible' || value === 'leave_empty' || value === 'generate_brief') {
    return value
  }
  if (typeof value === 'boolean') {
    return value ? 'extract_visible' : 'leave_empty'
  }
  return fallback
}

function buildSharedQuestionContentRuleLines(
  startNo: number,
  resultFieldName = 'questionsToUpsert',
  answerHandlingMode: boolean | AnswerHandlingMode = 'extract_visible',
) {
  const mode = resolveAnswerHandlingMode(answerHandlingMode)
  const lines = [
    'GROUP 类型如有公共题干，必须写入 stem.text；不能漏掉，也不能把公共题干塞进 children.prompt，不能把小题的题目写入stem.text。',
    'GROUP.children 的 prompt.text 不要保留“(1)”“（2）”这类前缀编号；编号只用于 orderNo/子题顺序。',
    '只有同一顶层题号下出现 (1)/(2)/①/② 等子问并共享同一题干时，才允许使用 GROUP。',
    '“一、填空题”“二、选择题”“三、判断题”“四、计算题/证明题/解答题”等只作为栏目标题或题型说明，不作为题目节点，不要把栏目标题提取成 GROUP。',
    '栏目标题下面的“1.、2.、3.”等每一个编号题都必须作为独立顶层大题提取；即使它们同属填空题、选择题等栏目，也不能合并到同一个 GROUP 里。',
    '如果某个编号题自身又包含 (1)/(2)/①/② 等小问，并且共享该编号题的公共题干，才把这个编号题做成 GROUP；GROUP 的 children 只能来自该编号题内部的小问。',
    'questionId 的主编号按当前小节所有顶层题出现顺序连续递增，不因“填空题/选择题/计算题”等栏目切换而重置。',
    'title 可以保留栏目名和栏目内显示题号用于区分；例如整节第9道顶层题是“计算题”栏目里的第2题，则 questionId 可为 q_12_8_9，但 title 应写成“总习题十二 计算题 第2题”。',
    'GROUP/长题只有在整道顶层大题已经闭合时才允许输出；如果后续小问仍未出现、仍在续页、或只完整看到了前几个小问，整道题都不得输出。',
    '长题必须完整覆盖所有可见小问；禁止只输出前几个和最后一个，中间大量缺失。',
    mode === 'generate_brief'
      ? '如果某道长题的小问序号明显断档，就不要把这道题误判成已经完整收齐的小问结构。'
      : '如果某道长题的小问序号明显断档、或最后一个答案只写了一半，就不要把这道题当成完整题输出。',
    `如果本次可见范围里有完整题号与题干，${resultFieldName} 不得为空。`,
    'title 中的栏目内题号按图片显示；questionId 中的主编号按当前小节顶层题全局顺序连续编号。',
    'questionId 必须以 q_ 开头，格式示例: q_9_3_1, q_9_3_1_2。',
    'chapterId 必须以 ch_ 开头，questionId 与 chapterId 前缀不可混用。',
    '若题型是 SINGLE_CHOICE 或 MULTI_CHOICE，prompt.text 只保留题干本身；A/B/C/D 选项必须拆到 options 数组中，不能继续拼在 prompt.text 末尾。',
    '当同一页跨到新小节时，切换后的题必须使用新小节的 chapterId 和对应 questionId 前缀，不能继续沿用旧小节。',
    '不确定字符用【待校对】替代，禁止猜测。',
  ]

  if (mode === 'generate_brief') {
    lines.push(
      'prompt.text 必须逐字贴近图片原文，不得总结改写，不得补充题干。',
      '本次文档无现成答案，standardAnswer.text 需要根据题目自行生成，不要伪装成图片原文。',
      '生成答案必须包含必要解题步骤：计算题要写出关键计算过程，证明题要写出关键论证链条，不能只给结论或省略关键推导。',
      '若题型是 SINGLE_CHOICE 或 MULTI_CHOICE，prompt.text 只写题干，不得把 A/B/C/D 选项行混入 prompt.text；选项必须逐项写入 options。',
      '若题型是 SINGLE_CHOICE 或 MULTI_CHOICE，standardAnswer.text 只写正确选项字母，如 "B" 或 "A,C"；解析过程必须写入 standardAnswer.explanation，禁止写成“答案：B\\n解析：...”或把解析混入 standardAnswer.text。',
      '答案应是完整可校对的标准答案；不要写题外拓展、方法总结、多个解法对比或长篇讲义。',
      '若题目要求编程、写代码、设计算法实现或输出程序，standardAnswer.text="" 且 standardAnswer.media=[].',
    )
  } else if (mode === 'leave_empty') {
    lines.push(
      'prompt.text 必须逐字贴近图片原文，不得总结改写，不得补充推导。',
      '本次文档无可提取答案，不得自行作答；所有 standardAnswer 字段保持空字符串与空 media。',
      '即使题目看起来可以根据常识求解，也不能补写图片中不存在的答案。',
    )
  } else {
    lines.push(
      'prompt.text 与 standardAnswer.text 必须逐字贴近图片原文，不得总结改写，不得补充推导。',
      '不得根据常识、公式套路或上下文自行补充图片中不可见的答案；课本没显示出来的内容不能自己续写。',
      'standardAnswer 必须保留与答案相关的课本上有的推导/证明过程，不能编撰不存在的过程，删除思路探索、归纳总结、方法拓展等无关内容。',
    )
  }

  return numberInstructionLines(startNo, lines)
}

function buildSharedQuestionStructureInstructionLines(
  answerHandlingMode: boolean | AnswerHandlingMode = 'extract_visible',
) {
  const mode = resolveAnswerHandlingMode(answerHandlingMode)
  const lines = [
    '题目对象必须是 LEAF 或 GROUP 两种之一。',
    'questionType 只能取: PROOF, CALCULATION, CODE, SHORT_ANSWER, SINGLE_CHOICE, MULTI_CHOICE, JUDGE。',
    'questionType 映射规则: 填空题=>SHORT_ANSWER；选择题/单项选择题=>SINGLE_CHOICE；多项选择题=>MULTI_CHOICE；判断题=>JUDGE；含“编程/程序/代码”=>CODE；含“证明”=>PROOF；含“求/解/计算”=>CALCULATION；无法判断=>SHORT_ANSWER。',
    'LEAF 必填字段:',
    '- questionId, chapterId, nodeType("LEAF"), questionType, title, prompt, standardAnswer, defaultScore, rubric',
    'GROUP 必填字段:',
    '- questionId, chapterId, nodeType("GROUP"), questionType, title, stem, children',
    'GROUP.children 每项必填字段:',
    '- questionId, orderNo(从1递增), questionType, chapterId(与父题一致), prompt, standardAnswer, defaultScore, rubric',
    'prompt / stem / 普通题 standardAnswer 的 TextBlock 结构固定为: { "text": "string", "media": [] }',
    '选择题字段规则:',
    '- SINGLE_CHOICE / MULTI_CHOICE 还必须包含 options、correctOptionIds、allowPartial。',
    '- options 结构固定为: [{ "id": "A", "text": "string" }, { "id": "B", "text": "string" }, ...]；选项文字不得再写回 prompt.text。',
    '- SINGLE_CHOICE 的 correctOptionIds 必须且只能有 1 个选项 id，allowPartial 固定为 false。',
    '- MULTI_CHOICE 的 correctOptionIds 必须写全部正确选项 id；未明确允许部分得分时 allowPartial=false。',
    '- 选择题 standardAnswer.text 只写正确选项字母；若需要解析，写入 standardAnswer.explanation，示例: { "text": "B", "media": [], "explanation": "..." }。',
    'TextBlock.text 必须使用 Markdown 文本，保持原顺序和原换行。',
    '公式写法: 行内公式使用 $...$；独立成行公式使用 $$...$$。',
    '公式必须转成 LaTeX，使用Katex语法，不得改成口语描述。',
    'LaTeX 写入 JSON 字符串时，所有反斜杠都必须双写，例如 \\frac 在 JSON 中必须写成 \\\\frac，\\sqrt 必须写成 \\\\sqrt，\\times 必须写成 \\\\times。',
    '严禁输出会被 JSON 当成转义字符吞掉的单反斜杠写法，例如 \\frac、\\times、\\rho、\\nu、\\left、\\right、\\begin{aligned}、\\end{aligned}；这些在 JSON 里都必须写成双反斜杠形式。',
    '凡是使用块公式 $$...$$ 的地方，必须成对闭合；若出现 \\begin{aligned}、\\end{aligned}、\\begin{cases}、\\end{cases} 等环境，必须放在完整闭合的 $$...$$ 或 $...$ 内，禁止只写开头不写结尾。',
    'media 如有图片，结构固定为: { "type":"image", "url":"https://9_3_1.png", "caption":"string", "orderNo":1 }',
    'media.url 统一按 questionId 去掉前缀 q_ 后生成，例如 questionId=q_9_3_1 则 url=https://9_3_1.png。',
    '无图时 media 必须是空数组 []，不得省略字段。',
    'rubric 为数组，元素结构: { "rubricItemKey":"key_1", "maxScore": number, "criteria":"string" }',
    'rubric 条数必须为 2-4 条；rubricItemKey 必须连续 key_1,key_2,...；criteria 不得为空字符串。',
    'rubric 每条 maxScore 必须为正数，所有 maxScore 总和必须等于 10。',
    '每题 defaultScore 固定 10，且 rubric 所有 maxScore 之和必须等于 10。',
  ]
  lines.push(
    mode === 'generate_brief'
      ? '本次文档无现成答案，standardAnswer 必须基于题目自行生成包含必要解题步骤的标准答案，并继续遵守 Markdown/LaTeX/TextBlock 结构；不能只给结论或省略关键推导。若题目是编程/写代码题，则 standardAnswer.text="" 且 standardAnswer.media=[].'
      : mode === 'leave_empty'
        ? '本次文档不提供答案，所有 standardAnswer 字段必须保留，但统一返回 standardAnswer.text="" 且 standardAnswer.media=[].'
        : '若图片中未给出标准答案: standardAnswer.text="" 且 standardAnswer.media=[].',
  )
  return lines
}

function findChapterByTitle(payload: TextbookJsonPayload, chapterTitle: string) {
  return payload.chapters.find(
    (item) => item.parentId === null && normalizeTitle(item.title) === normalizeTitle(chapterTitle),
  )
}

function findChapterById(payload: TextbookJsonPayload, chapterId: string) {
  return payload.chapters.find((item) => item.chapterId === chapterId)
}

function findSectionByTitle(payload: TextbookJsonPayload, parentChapterId: string, sectionTitle: string) {
  return payload.chapters.find(
    (item) => item.parentId === parentChapterId && normalizeTitle(item.title) === normalizeTitle(sectionTitle),
  )
}

function resolveSectionChapterId(payload: TextbookJsonPayload, chapterTitle: string, sectionTitle: string) {
  const chapter = findChapterByTitle(payload, chapterTitle)
  if (!chapter) return ''
  const section = findSectionByTitle(payload, chapter.chapterId, sectionTitle)
  return section?.chapterId || ''
}

function buildCanonicalQuestionTitle(sectionTitle: string, mainQuestionNo: string, subQuestionNo?: string) {
  const parts: string[] = []
  const section = normalizeTitle(sectionTitle)
  if (section) {
    parts.push(section)
  }
  if (mainQuestionNo && mainQuestionNo !== '0') {
    parts.push(`第${mainQuestionNo}题`)
  }
  if (subQuestionNo && String(subQuestionNo).trim()) {
    parts.push(`第${String(subQuestionNo).trim()}小题`)
  }
  return parts.join(' ').trim()
}

const QUESTION_TITLE_CATEGORY_LABELS = [
  '单项选择题',
  '多项选择题',
  '不定项选择题',
  '填空题',
  '选择题',
  '判断题',
  '计算题',
  '证明题',
  '解答题',
  '应用题',
  '综合题',
  '简答题',
  '作图题',
  '问答题',
  '讨论题',
]

function extractQuestionTitleCategory(value: string) {
  const title = normalizeTitle(value)
  if (!title) return null
  for (const label of QUESTION_TITLE_CATEGORY_LABELS) {
    const index = title.indexOf(label)
    if (index === -1) continue
    const tail = title.slice(index + label.length)
    const questionNo = tail.match(/第\s*(\d+)\s*题/)?.[1] || ''
    if (!questionNo) continue
    return { label, questionNo }
  }
  return null
}

function buildQuestionDisplayTitle(
  sectionTitle: string,
  sourceTitle: string,
  mainQuestionNo: string,
  subQuestionNo?: string,
) {
  const category = extractQuestionTitleCategory(sourceTitle)
  if (category) {
    const parts: string[] = []
    const section = normalizeTitle(sectionTitle)
    if (section) {
      parts.push(section)
    }
    parts.push(category.label, `第${category.questionNo}题`)
    if (subQuestionNo && String(subQuestionNo).trim()) {
      parts.push(`第${String(subQuestionNo).trim()}小题`)
    }
    return parts.join(' ').trim()
  }
  return buildCanonicalQuestionTitle(sectionTitle, mainQuestionNo, subQuestionNo)
}

function extractSubQuestionNoFromQuestionId(questionId: string) {
  const normalized = normalizeDigits(String(questionId || ''))
  const match = normalized.match(/^q_(\d+)_(\d+)_(\d+)_(\d+)$/)
  return match?.[4] || ''
}

function rewriteQuestionTitlesByResolvedChapter(payload: TextbookJsonPayload, items: QuestionItem[]) {
  return items.map((item) => {
    const sectionTitle = payload.chapters.find((chapter) => chapter.chapterId === item.chapterId)?.title || ''
    const mainQuestionNo = extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title)
    const subQuestionNo = item.nodeType === 'LEAF' ? extractSubQuestionNoFromQuestionId(item.questionId) : ''
    if (item.nodeType === 'GROUP') {
      return {
        ...item,
        title: buildQuestionDisplayTitle(sectionTitle, item.title, mainQuestionNo) || item.title,
        children: item.children.map((child) => {
          const childSubQuestionNo =
            extractSubQuestionNoFromQuestionId(child.questionId) ||
            extractQuestionNoFromPrompt(child.prompt.text) ||
            String(child.orderNo)
          return {
            ...child,
            title:
              buildQuestionDisplayTitle(sectionTitle, item.title, mainQuestionNo, childSubQuestionNo) ||
              (child as QuestionGroupChild).title,
          }
        }),
      } as QuestionItem
    }
    return {
      ...item,
      title: buildQuestionDisplayTitle(sectionTitle, item.title, mainQuestionNo, subQuestionNo) || item.title,
    } as QuestionItem
  })
}

function normalizeQuestionItem(
  rawQuestion: unknown,
  fallbackChapterId: string,
  fallbackSectionTitle: string,
  options?: {
    expectAnswer?: boolean
    answerHandlingMode?: boolean | AnswerHandlingMode
    forceFallbackChapterId?: boolean
  },
): QuestionItem | null {
  if (!rawQuestion || typeof rawQuestion !== 'object') return null
  const source = rawQuestion as Record<string, unknown>
  const answerHandlingMode = resolveAnswerHandlingMode(
    options?.answerHandlingMode,
    options?.expectAnswer !== false ? 'extract_visible' : 'leave_empty',
  )
  const forceEmptyAnswer = answerHandlingMode === 'leave_empty'

  const nodeTypeRaw = String(source.nodeType || 'LEAF').trim().toUpperCase()
  const nodeType = nodeTypeRaw === 'GROUP' ? 'GROUP' : 'LEAF'
  const chapterId =
    options?.forceFallbackChapterId === false
      ? normalizeChapterId(source.chapterId, fallbackChapterId)
      : fallbackChapterId
  const title = String(source.title || '').trim()
  const promptText =
    source.prompt && typeof source.prompt === 'object'
      ? String((source.prompt as Record<string, unknown>).text || '')
      : ''
  const questionType = normalizeQuestionType(source.questionType)
  const mainQuestionNo =
    extractQuestionNoFromId(String(source.questionId || '').trim()) || extractQuestionNoFromText(title) || '0'
  const questionId = normalizeQuestionId(source.questionId, chapterId, mainQuestionNo)
  const leafSubQuestionNo = extractQuestionNoFromPrompt(promptText)
  const canonicalTitle =
    buildQuestionDisplayTitle(
      fallbackSectionTitle,
      title,
      mainQuestionNo,
      nodeType === 'LEAF' ? leafSubQuestionNo : '',
    ) || title

  if (nodeType === 'GROUP') {
    const childrenRaw = Array.isArray(source.children) ? source.children : []
    const children = childrenRaw
      .map((child, index) => {
        if (!child || typeof child !== 'object') return null
        const row = child as Record<string, unknown>
        const orderNo = Number(row.orderNo) || index + 1
        const childNo =
          extractQuestionNoFromPrompt(
            (row.prompt && typeof row.prompt === 'object'
              ? String((row.prompt as Record<string, unknown>).text || '')
              : '') as string,
          ) || String(orderNo)
        const childQuestionId = normalizeQuestionId(row.questionId, chapterId, mainQuestionNo, childNo)
        const childQuestionType = normalizeQuestionType(row.questionType)
        const childPrompt = toTextBlock(row.prompt, childQuestionId, false)
        const childChoice = isChoiceQuestionType(childQuestionType)
          ? normalizeChoicePromptAndOptions(row.options, childPrompt)
          : { prompt: childPrompt, options: [] as QuestionOption[] }
        const childAnswerBlock = toTextBlock(row.standardAnswer, childQuestionId, true, forceEmptyAnswer)
        const childParsedChoiceAnswer = isChoiceQuestionType(childQuestionType)
          ? parseChoiceAnswerText(childAnswerBlock.text)
          : { optionIds: [] as string[] }
        const childCorrectOptionIds = isChoiceQuestionType(childQuestionType)
          ? normalizeCorrectOptionIds(
              row.correctOptionIds,
              childParsedChoiceAnswer.optionIds,
              childQuestionType,
              forceEmptyAnswer,
            )
          : []
        const childStandardAnswer = isChoiceQuestionType(childQuestionType)
          ? normalizeChoiceStandardAnswer(
              row.standardAnswer,
              childAnswerBlock,
              childQuestionType,
              childCorrectOptionIds,
              forceEmptyAnswer,
            )
          : childAnswerBlock
        return {
          questionId: childQuestionId,
          title: buildQuestionDisplayTitle(fallbackSectionTitle, title, mainQuestionNo, childNo),
          orderNo,
          questionType: childQuestionType,
          chapterId: chapterId,
          prompt: childChoice.prompt,
          standardAnswer: childStandardAnswer,
          ...(isChoiceQuestionType(childQuestionType)
            ? {
                options: childChoice.options,
                correctOptionIds: childCorrectOptionIds,
                allowPartial: childQuestionType === 'SINGLE_CHOICE' ? false : row.allowPartial === true,
              }
            : {}),
          defaultScore: Number(row.defaultScore) || 10,
          rubric: toRubric(row.rubric),
        } as QuestionGroupChild
      })
      .filter(Boolean) as QuestionGroupChild[]

    const stem = toTextBlock(source.stem, questionId, false)
    if (!stem.text.trim()) {
      const stemFromTitle = stripLeadingQuestionLabel(title)
      if (stemFromTitle) {
        stem.text = stemFromTitle
      }
    }
    return {
      questionId,
      chapterId,
      nodeType: 'GROUP',
      questionType,
      title: canonicalTitle,
      stem,
      children,
    }
  }

  const prompt = toTextBlock(source.prompt, questionId, false)
  if (!prompt.text.trim()) {
    const promptFromTitle = stripLeadingQuestionLabel(title)
    if (promptFromTitle) {
      prompt.text = promptFromTitle
    }
  }
  const leafChoice = isChoiceQuestionType(questionType)
    ? normalizeChoicePromptAndOptions(source.options, prompt)
    : { prompt, options: [] as QuestionOption[] }
  const answerBlock = toTextBlock(source.standardAnswer, questionId, true, forceEmptyAnswer)
  const parsedChoiceAnswer = isChoiceQuestionType(questionType)
    ? parseChoiceAnswerText(answerBlock.text)
    : { optionIds: [] as string[] }
  const correctOptionIds = isChoiceQuestionType(questionType)
    ? normalizeCorrectOptionIds(
        source.correctOptionIds,
        parsedChoiceAnswer.optionIds,
        questionType,
        forceEmptyAnswer,
      )
    : []
  const standardAnswer = isChoiceQuestionType(questionType)
    ? normalizeChoiceStandardAnswer(
        source.standardAnswer,
        answerBlock,
        questionType,
        correctOptionIds,
        forceEmptyAnswer,
      )
    : answerBlock
  return {
    questionId,
    chapterId,
    nodeType: 'LEAF',
    questionType,
    title: canonicalTitle,
    prompt: leafChoice.prompt,
    standardAnswer,
    ...(isChoiceQuestionType(questionType)
      ? {
          options: leafChoice.options,
          correctOptionIds,
          allowPartial: questionType === 'SINGLE_CHOICE' ? false : source.allowPartial === true,
        }
      : {}),
    defaultScore: Number(source.defaultScore) || 10,
    rubric: toRubric(source.rubric),
  }
}

function upsertQuestionsById(payload: TextbookJsonPayload, incoming: QuestionItem[]) {
  const existing = Array.isArray(payload.questions) ? [...payload.questions] : []
  const indexMap = new Map<string, number>()
  existing.forEach((item, index) => {
    const row = item as Record<string, unknown>
    const rawId = typeof row.questionId === 'string' ? row.questionId.trim() : ''
    const id = rawId
    if (id) {
      row.questionId = id
      indexMap.set(id, index)
      if (rawId && rawId !== id) {
        indexMap.set(rawId, index)
      }
    }
  })

  for (const item of incoming) {
    const idx = indexMap.get(item.questionId)
    if (idx === undefined) {
      existing.push(item)
      indexMap.set(item.questionId, existing.length - 1)
    } else {
      existing[idx] = item
    }
  }

  payload.questions = existing
}

function collectPendingReviewLogs(questions: QuestionItem[]) {
  const logs: Array<Record<string, string>> = []
  const marker = '【待校对】'
  for (const item of questions) {
    if (item.nodeType === 'GROUP') {
      if (item.stem.text.includes(marker)) {
        logs.push({ questionId: item.questionId, path: 'stem.text', text: item.stem.text })
      }
      for (const child of item.children) {
        if (child.prompt.text.includes(marker)) {
          logs.push({ questionId: child.questionId, path: 'prompt.text', text: child.prompt.text })
        }
        if (child.standardAnswer.text.includes(marker)) {
          logs.push({ questionId: child.questionId, path: 'standardAnswer.text', text: child.standardAnswer.text })
        }
      }
    } else {
      if (item.prompt.text.includes(marker)) {
        logs.push({ questionId: item.questionId, path: 'prompt.text', text: item.prompt.text })
      }
      if (item.standardAnswer.text.includes(marker)) {
        logs.push({ questionId: item.questionId, path: 'standardAnswer.text', text: item.standardAnswer.text })
      }
    }
  }
  return logs
}

async function appendPendingReviewLogs(sessionId: string, logs: Array<Record<string, string>>) {
  if (!logs.length) return
  const logFile = path.join(READ_RESULTS_DIR, 'pending_review_questions.jsonl')
  const lines = logs.map((item) =>
    JSON.stringify({
      ts: new Date().toISOString(),
      sessionId,
      ...item,
    }),
  )
  await fsp.appendFile(logFile, `${lines.join('\n')}\n`, { encoding: 'utf8' })
}

function isSupportedImageFileName(fileName: string) {
  return /\.(jpg|jpeg|png|webp)$/i.test(fileName)
}

function sortImageFileNames(fileNames: string[]) {
  return [...fileNames].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' }))
}

async function appendAutoProcessFailureLog(params: {
  sessionId: string
  imagePath: string
  error: string
}) {
  const { sessionId, imagePath, error } = params
  const logFile = path.join(READ_RESULTS_DIR, 'auto_process_failures.jsonl')
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    sessionId,
    imagePath,
    error,
  })
  await fsp.appendFile(logFile, `${line}\n`, { encoding: 'utf8' })
}

function writeNdjson(res: Response, payload: Record<string, unknown>) {
  res.write(`${JSON.stringify(payload)}\n`)
}

function normalizeJsonFileName(fileName: string) {
  const safe = sanitizeFileName(path.basename(fileName || ''))
  const finalName = safe || `textbook_${batchId()}`
  return finalName.toLowerCase().endsWith('.json') ? finalName : `${finalName}.json`
}

function getPayloadDocumentType(payload: unknown): DocumentType {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  if (String(data.documentType || '').trim().toLowerCase() === 'exam') {
    return 'exam'
  }
  if (data.exam && typeof data.exam === 'object') {
    return 'exam'
  }
  return 'textbook'
}

function getPayloadSourceMeta(payload: TextbookJsonPayload) {
  const documentType = getPayloadDocumentType(payload)
  if (documentType === 'exam') {
    const exam = payload.exam && typeof payload.exam === 'object' ? payload.exam : null
    return {
      documentType,
      externalId: String(exam?.examId || '').trim(),
      title: String(exam?.title || '').trim(),
      subject: String(exam?.subject || '').trim(),
      publisher: '',
      examType: String(exam?.examType || '').trim(),
      hasAnswer: exam?.hasAnswer !== false,
      answerHandlingMode: resolveAnswerHandlingMode(
        exam && typeof exam === 'object' ? (exam as Record<string, unknown>).answerHandlingMode as AnswerHandlingMode | undefined : undefined,
        exam?.hasAnswer !== false ? 'extract_visible' : 'leave_empty',
      ),
      rawMeta: exam,
    }
  }

  const textbook = payload.textbook && typeof payload.textbook === 'object' ? payload.textbook : null
  return {
    documentType,
    externalId: String(textbook?.textbookId || '').trim(),
    title: String(textbook?.title || '').trim(),
    subject: String(textbook?.subject || '').trim(),
    publisher: String(textbook?.publisher || '').trim(),
    examType: '',
    hasAnswer: textbook?.hasAnswer !== false,
    answerHandlingMode: resolveAnswerHandlingMode(
      textbook && typeof textbook === 'object' ? (textbook as Record<string, unknown>).answerHandlingMode as AnswerHandlingMode | undefined : undefined,
      textbook?.hasAnswer !== false ? 'extract_visible' : 'generate_brief',
    ),
    rawMeta: textbook,
  }
}

function getPayloadAnswerHandlingMode(payload: TextbookJsonPayload): AnswerHandlingMode {
  const sourceMeta = getPayloadSourceMeta(payload)
  return sourceMeta.answerHandlingMode
}

function payloadExpectsAnswer(payload: TextbookJsonPayload) {
  return getPayloadAnswerHandlingMode(payload) !== 'leave_empty'
}

function isValidTextbookPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return false
  const data = payload as Record<string, unknown>
  if (typeof data.version !== 'string' || !data.version.trim()) return false
  if (typeof data.courseId !== 'string' || !data.courseId.trim()) return false
  const documentType = getPayloadDocumentType(data)
  if (documentType === 'exam') {
    if (!data.exam || typeof data.exam !== 'object') return false
    const exam = data.exam as Record<string, unknown>
    if (typeof exam.examId !== 'string' || !exam.examId.trim()) return false
    if (typeof exam.title !== 'string') return false
    if (typeof exam.subject !== 'string') return false
    if (!['quiz', 'midterm', 'final'].includes(String(exam.examType || '').trim())) return false
    if (typeof exam.hasAnswer !== 'boolean') return false
    if (exam.answerHandlingMode !== undefined && !['extract_visible', 'leave_empty', 'generate_brief'].includes(String(exam.answerHandlingMode || '').trim())) {
      return false
    }
  } else {
    if (!data.textbook || typeof data.textbook !== 'object') return false
    const textbook = data.textbook as Record<string, unknown>
    if (typeof textbook.textbookId !== 'string' || !textbook.textbookId.trim()) return false
    if (typeof textbook.title !== 'string') return false
    if (typeof textbook.publisher !== 'string') return false
    if (typeof textbook.subject !== 'string') return false
    if (textbook.hasAnswer !== undefined && typeof textbook.hasAnswer !== 'boolean') return false
    if (textbook.answerHandlingMode !== undefined && !['extract_visible', 'leave_empty', 'generate_brief'].includes(String(textbook.answerHandlingMode || '').trim())) {
      return false
    }
  }
  if (!Array.isArray(data.chapters)) return false
  if (!Array.isArray(data.questions)) return false
  return true
}

async function loadTextbookJson(filePath: string): Promise<TextbookJsonPayload> {
  const text = await fsp.readFile(filePath, 'utf8')
  const parsed = JSON.parse(text) as unknown
  if (!isValidTextbookPayload(parsed)) {
    throw new Error('Target json file format is invalid')
  }
  return parsed as TextbookJsonPayload
}

function stripMediaCaptionsDeep(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach((item) => stripMediaCaptionsDeep(item))
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  if (Array.isArray(record.media)) {
    record.media.forEach((item) => {
      if (item && typeof item === 'object' && 'caption' in item) {
        ;(item as Record<string, unknown>).caption = ''
      }
    })
  }

  Object.values(record).forEach((item) => stripMediaCaptionsDeep(item))
}

async function saveTextbookJson(filePath: string, payload: TextbookJsonPayload) {
  normalizePersistedChoiceQuestionShapes(payload)
  stripMediaCaptionsDeep(payload)
  const text = `${JSON.stringify(payload, null, 2)}\n`
  await fsp.writeFile(filePath, text, { encoding: 'utf8' })
}

function getImageMimeByPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return ''
}

function getImageMimeByFile(file: Express.Multer.File) {
  const fromMime = String(file.mimetype || '').toLowerCase()
  if (fromMime === 'image/png' || fromMime === 'image/webp' || fromMime === 'image/jpeg') {
    return fromMime
  }
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return ''
}

async function toImageDataUrl(imagePath: string) {
  const mime = getImageMimeByPath(imagePath)
  if (!mime) {
    throw new Error(`Unsupported image type: ${imagePath}`)
  }
  const bytes = await fsp.readFile(imagePath)
  return `data:${mime};base64,${bytes.toString('base64')}`
}

async function toImageDataUrlFromFile(file: Express.Multer.File) {
  const mime = getImageMimeByFile(file)
  if (!mime) {
    throw new Error(`Unsupported image file: ${file.originalname || 'unknown'}`)
  }
  const bytes = await readUploadedFileBuffer(file)
  return `data:${mime};base64,${bytes.toString('base64')}`
}

function extractArkText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const asObj = payload as Record<string, unknown>

  const outputText = asObj.output_text
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText.trim()
  }

  const output = asObj.output
  if (!Array.isArray(output)) return ''

  const parts: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const piece of content) {
      if (!piece || typeof piece !== 'object') continue
      const text = (piece as Record<string, unknown>).text
      if (typeof text === 'string' && text.trim()) {
        parts.push(text)
        continue
      }
      const altText = (piece as Record<string, unknown>).output_text
      if (typeof altText === 'string' && altText.trim()) {
        parts.push(altText)
      }
    }
  }
  return parts.join('\n').trim()
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const name = String((error as { name?: unknown }).name || '')
  const message = String((error as { message?: unknown }).message || '')
  return name === 'AbortError' || message.toLowerCase().includes('aborted')
}

function isTransientNetworkError(error: unknown) {
  const message = String((error as { message?: unknown })?.message || '').toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('eai_again') ||
    message.includes('socket hang up')
  )
}

async function sleep(ms: number) {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function getEffectiveArkApiKey() {
  return getArkApiKeyOverride() || ARK_API_KEY
}

async function requestArkRawWithRetry(body: Record<string, unknown>) {
  const arkApiKey = getEffectiveArkApiKey()
  if (!arkApiKey) {
    throw new Error('ARK_API_KEY is missing')
  }
  const totalAttempts = Math.max(1, ARK_RETRY_TIMES + 1)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ARK_TIMEOUT_MS)
    try {
      const resp = await fetch(`${ARK_BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${arkApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const raw = await resp.text()
      if (!resp.ok) {
        const retryableStatus = resp.status === 429 || resp.status >= 500
        if (retryableStatus && attempt < totalAttempts) {
          await sleep(ARK_RETRY_DELAY_MS)
          continue
        }
        throw new Error(`Ark request failed: ${resp.status} ${raw}`)
      }
      return raw
    } catch (error) {
      lastError = error
      const retryable = isAbortError(error) || isTransientNetworkError(error)
      if (retryable && attempt < totalAttempts) {
        await sleep(ARK_RETRY_DELAY_MS)
        continue
      }
      if (retryable) {
        throw new Error(
          `Ark request failed after retries (timeout/network). timeout=${ARK_TIMEOUT_MS}ms attempts=${totalAttempts}.`,
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  if (isAbortError(lastError)) {
    throw new Error(
      `Ark request timeout after ${ARK_TIMEOUT_MS}ms (attempts: ${Math.max(1, ARK_RETRY_TIMES + 1)}). You can raise ARK_TIMEOUT_MS.`,
    )
  }
  if (isTransientNetworkError(lastError)) {
    throw new Error(
      `Ark request network failure after retries (attempts: ${Math.max(1, ARK_RETRY_TIMES + 1)}).`,
    )
  }
  throw (lastError instanceof Error ? lastError : new Error(String(lastError || 'Unknown Ark error')))
}

async function readByDoubao(dataUrls: string[]) {
  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }

  const userContent: Array<Record<string, string>> = [
    {
      type: 'input_text',
      text:
        '请读取图片中的可见内容并逐字输出。不要总结，不要解释，不要补充，不要改写。保留原有顺序、换行和标点。',
    },
  ]

  for (const dataUrl of dataUrls) {
    userContent.push({
      type: 'input_image',
      image_url: dataUrl,
    })
  }

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: '你是一个只做逐字转写的视觉模型助手。',
          },
        ],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  if (!text) {
    throw new Error('Ark response has no text output')
  }
  return text
}

async function repairModelJsonByDoubao(params: {
  brokenOutputText: string
  parseError: string
}): Promise<Record<string, unknown>> {
  const { brokenOutputText, parseError } = params
  const instruction = [
    '你是 JSON 修复器。',
    '下面给你一段模型输出和解析错误，请修复为可 JSON.parse 的对象。',
    '要求：',
    '1) 保留原语义，不要新增解释文本。',
    '2) 只输出 JSON 对象，不要 markdown。',
    '3) 顶层仍为 chapter/question 结构。',
    `解析错误: ${parseError}`,
    '原输出如下：',
    brokenOutputText,
  ].join('\n')

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '只输出可解析 JSON。' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: instruction }],
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Repair output is not JSON: ${text.slice(0, 500)}`)
  }
  return parseModelJsonObject(jsonText)
}

async function regenerateModelJsonWithImagesByDoubao(params: {
  imageDataUrls: string[]
  originalInstruction: string
  parseError: string
  previousOutputText: string
}): Promise<Record<string, unknown>> {
  const { imageDataUrls, originalInstruction, parseError, previousOutputText } = params
  const retryInstruction = [
    originalInstruction,
    '上一次输出 JSON 解析失败，请基于同一批图片重新生成完整 JSON。',
    `解析错误: ${parseError}`,
    '要求:',
    '1) 必须重新看图生成，不要直接复述上一次文本。',
    '2) 仅输出 JSON 对象，不要 markdown。',
    '3) 严格保证 JSON 可被 JSON.parse。',
    '上一次失败输出如下(仅供纠错参考):',
    previousOutputText,
  ].join('\n')

  const userContent: Array<Record<string, string>> = [{ type: 'input_text', text: retryInstruction }]
  for (const dataUrl of imageDataUrls) {
    userContent.push({ type: 'input_image', image_url: dataUrl })
  }

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '只输出可解析 JSON。' }],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Regenerate output is not JSON: ${text.slice(0, 500)}`)
  }
  return parseModelJsonObject(jsonText)
}

async function detectChapterBoundaryAndPendingByDoubao(params: {
  imageDataUrls: string[]
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  pendingContinueQuestionKey: string | null
  crossPageContext?: string
  retryHint?: string
}): Promise<{ question: QuestionBoundaryResult }> {
  const {
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    mode,
    processingStartQuestionKey = null,
    pendingContinueQuestionKey,
    crossPageContext = '',
    retryHint = '',
  } = params

  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }
  if (mode === 'cross_page_merge' && (imageDataUrls.length < 2 || imageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(`cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images, got ${imageDataUrls.length}`)
  }

  const instruction = [
    '你是教材页边界检测器。你只看本次传入的正式队列图片，不知道也不能推测预读页；你只做边界判断，不生成题目 JSON 内容。',
    '上下文:',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- 处理模式: ${mode}`,
    `- 当前处理起点题号: ${processingStartQuestionKey || 'null'}`,
    `- 跨页续题标记: ${pendingContinueQuestionKey || 'null'}`,
    crossPageContext ? `跨页补充上下文: ${crossPageContext}` : '',
    retryHint ? `- 额外纠偏要求: ${retryHint}` : '',
    '要求:',
    '1) 只输出边界判断 JSON，不要输出题干、答案、rubric。',
    '2) 当前处理起点题号为 null 时，表示从队列第一页实际出现的第一个顶层大题开始。',
    '3) hasExtractableQuestions 判断的是：从起点开始，到当前队列最后一页为止，是否已经出现至少一道完整可导入的顶层大题。',
    '3.5) 对 GROUP/长题，只有整道顶层大题的所有小问和答案链都闭合后，才算“完整可导入”；前几个小问完整但后续小问未结束时，整道题仍算未完成。',
    '4) needNextPage 只判断“当前处理起点题号”对应那道题是否还需要下一页；不要用最后一题替代它。',
    '5) queueTailQuestionKey 表示“当前正式队列图片中，按阅读顺序最后实际出现的顶层大题”。只要能识别，必须返回；它不是当前章的最后一题、不是当前小节的最后一题、也不是当前处理起点，除非它确实就是正式队列最后出现的题。',
    '6) 如果正式队列图片里发生了小节或章节切换，必须根据图片实际内容判断切换后最后出现的顶层大题是谁，并让 queueTailQuestionKey 使用这道尾题真实所属的小节；不能因为后端游标来自旧小节，就把旧小节题误当成正式队列尾题。',
    '7) continueQuestionKey 只判断 queueTailQuestionKey 这道正式队列尾题是否还要续到后续页；若它需要后续页，则 continueQuestionKey 返回与 queueTailQuestionKey 完全相同的定位；否则返回 null。',
    '8) queueTailQuestionKey 和 continueQuestionKey 不能是 q/ch id，也不能是小题号；格式必须是“章标题 | 小节标题 | 第几题”。',
    '8.1) “一、填空题”“二、选择题”“三、判断题”“四、计算题/证明题/解答题”等只是栏目标题或题型说明，不是顶层大题。',
    '8.2) 栏目标题下面的“1.、2.、3.”等编号题，每一道都是独立顶层大题；如果正式队列尾部停在某个栏目内的第4个编号题，queueTailQuestionKey 应返回这道第4题的定位，不要返回栏目标题。',
    '8.3) 从“填空题”切到“选择题”只是栏目变化，不等同于章节/小节切换；queueTailQuestionKey 仍按最后实际出现的编号题定位。',
    '9) 对长题必须核对小问链和答案链是否真正闭合；不能只看页面末尾像是结束了就返回不跨页。',
    '10) hasExtractableQuestions=true 与 needNextPage=true 可以同时成立；这表示起点题还没补完，但当前队列里已经有别的完整题可导入。',
    '11) 例1：起点=第2题，当前队列里第2题补完，后面第3题完整，正式队列最后出现的顶层大题是第4题且它跨页 => hasExtractableQuestions=true, needNextPage=false, queueTailQuestionKey=第4题, continueQuestionKey=第4题。',
    '12) 例2：起点=第6题，当前队列里第6题补完，后面第7题完整，且正式队列最后出现的顶层大题也已结束 => hasExtractableQuestions=true, needNextPage=false, queueTailQuestionKey=第7题, continueQuestionKey=null。',
    '13) 例3：正式队列上半仍是习题8.1第8题，下半已切到习题8.2第1题，且正式队列最后出现的顶层大题是习题8.2第1题，则 queueTailQuestionKey 必须是“第八章 不定积分 | 习题8.2 | 第1题”；如果它不跨页，continueQuestionKey 返回 null。',
    '14) 只有在你有清晰证据证明起点题已经闭合时，needNextPage 才能为 false。',
    '严格输出 JSON（不要 markdown，不要解释）：',
    '{',
    '  "question": {',
    '    "needNextPage": true/false,',
    '    "queueTailQuestionKey": "string or null",',
    '    "continueQuestionKey": "string or null",',
    '    "hasExtractableQuestions": true/false,',
    '    "reason": "string"',
    '  }',
    '}',
  ].join('\n')

  const userContent: Array<Record<string, string>> = [{ type: 'input_text', text: instruction }]
  for (const dataUrl of imageDataUrls) {
    userContent.push({ type: 'input_image', image_url: dataUrl })
  }

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Boundary output is not JSON: ${text.slice(0, 500)}`)
  }

  let output: Record<string, unknown>
  try {
    output = parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    try {
      output = await regenerateModelJsonWithImagesByDoubao({
        imageDataUrls,
        originalInstruction: instruction,
        parseError,
        previousOutputText: text,
      })
    } catch (regenerateError) {
      const regenerateMsg = regenerateError instanceof Error ? regenerateError.message : String(regenerateError)
      output = await repairModelJsonByDoubao({
        brokenOutputText: text,
        parseError: `${parseError}; regenerate=${regenerateMsg}`,
      })
    }
  }

  const questionRaw =
    output.question && typeof output.question === 'object' ? (output.question as Record<string, unknown>) : {}
  const queueTailQuestionKey = readQuestionKeyField(questionRaw, [
    'queueTailQuestionKey',
    'currentQueueTailQuestionKey',
    'tailQuestionKey',
    'lastQuestionKey',
  ])
  const continueQuestionKey = readQuestionKeyField(questionRaw, ['continueQuestionKey'])

  return {
    question: {
      needNextPage: Boolean(questionRaw.needNextPage),
      queueTailQuestionKey,
      continueQuestionKey,
      hasExtractableQuestions:
        questionRaw.hasExtractableQuestions === true || questionRaw.hasExtractableQuestion === true,
      reason: typeof questionRaw.reason === 'string' ? questionRaw.reason : '',
      rawText: text,
    },
  }
}

async function detectChapterAndQuestionsByDoubao(params: {
  imageDataUrls: string[]
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  afterSwitchMode: boolean
  mode: 'single_page' | 'cross_page_merge'
  processingStartQuestionKey?: string | null
  extractEndBeforeQuestionKey?: string | null
  retryHint?: string
  answerHandlingMode?: boolean | AnswerHandlingMode
  questionSelectionMode?: 'complete_only' | 'all_visible'
  fixedChapterSection?: boolean
  allowLargeImageBatch?: boolean
}): Promise<CombinedExtractResult> {
  const {
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    afterSwitchMode,
    mode,
    processingStartQuestionKey = null,
    extractEndBeforeQuestionKey = null,
    retryHint,
    answerHandlingMode = 'extract_visible',
    questionSelectionMode = 'complete_only',
    fixedChapterSection = false,
    allowLargeImageBatch = false,
  } = params

  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }
  if (!allowLargeImageBatch && mode === 'cross_page_merge' && (imageDataUrls.length < 2 || imageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(
      `cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images, got ${imageDataUrls.length}`,
    )
  }

  const instruction = [
    '你是教材结构化提取器，一次同时输出 chapter 与 question 两部分 JSON。',
    '上下文:',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- afterSwitchMode: ${afterSwitchMode ? 'true' : 'false'}`,
    `- 处理模式: ${mode}`,
    '本轮提取范围（严格遵守）:',
    `{ "startQuestionKey": ${JSON.stringify(processingStartQuestionKey || null)}, "endBeforeQuestionKey": ${JSON.stringify(extractEndBeforeQuestionKey || null)} }`,
    retryHint ? `重试提示: ${retryHint}` : '',
    '章节规则:',
    ...(fixedChapterSection
      ? [
          '1) 本次章标题和小节标题完全以用户给定值为准，禁止根据图片自行切换章节或小节。',
          '2) 所有题目的 chapterId 都必须固定使用当前小节 chapterId。',
          '3) chapter.chapterTitle、chapter.sectionTitle、chapter.switchSectionTitle 一律返回 null。',
        ]
      : [
          '1) 后端传入的当前章标题、当前小节标题和 chapterId 只是处理游标/默认上下文，不是题目归属的最终依据；每道题的真实归属以正式队列图片中实际出现的章节/小节标题和位置为准。',
          '2) 本助手只接收正式队列图片，不接收预读页；不得推测下一页会切到哪个小节。',
          '3) 如果正式队列图片里没有实际出现新章节/小节标题，则 chapterTitle/sectionTitle/switchSectionTitle 返回 null，并按当前游标归属。',
          '4) 如果正式队列图片中途切到新章节或新小节，切换点之前的题保持旧章/旧小节，切换点之后的题必须改用新章/新小节编号，并如实写入 chapter 字段，供后端更新 chapters 树。',
          '5) switchSectionTitle 只表示正式队列里已经实际出现小节切换，用来通知后端更新游标；它不是给切换前题目强行改小节的依据。',
          '6) 每道题都必须写入它实际所属小节的 chapterId；切换前题目用当前小节 chapterId，切换后题目用新小节 chapterId。',
          '7) chapter.chapterTitle 只能填写纯章标题，例如“第九章 定积分”；chapter.sectionTitle 和 switchSectionTitle 只能填写纯小节标题，例如“习题9.1”。',
          '8) chapter 字段中严禁输出“章标题 | 小节标题”这类组合串；这种组合格式只允许用于题目定位字段，不允许用于章节树字段。',
        ]),
    '题目规则:',
    questionSelectionMode === 'all_visible'
      ? '1) 本次为无答案教材单页直提，不做跨页完整性判断；当前页出现的所有习题都要提取。若题目在页首或页尾被截断，也按当前页可见内容输出，不要等待下一页。'
      : '1) 只提取给定范围内在图片上完整可见的顶层大题；未完整显示的题不要输出。',
    '2) startQuestionKey=null 时，从队列第一页实际出现的第一个顶层大题开始。',
    '3) endBeforeQuestionKey!=null 时，只提取到该题之前；该题本身严禁输出。',
    '4) endBeforeQuestionKey=null 时，必须提取从 startQuestionKey 开始到当前队列末尾之间所有完整顶层大题；绝不能自行制造新的截止题号，也绝不能只提取起点题。',
    '5) startQuestionKey 与 endBeforeQuestionKey 指向同一道题时，不表示空范围；表示当前正在续这道题。若它在当前队列里已完整结束，就输出它；否则不要输出。',
    '6) 典型场景：起点=第2题，截止=第4题，当前队列里第2题已完整、后面第3题完整 => 必须同时输出第2题和第3题，不输出第4题。',
    '7) 典型场景：起点=第6题，截止=null，当前队列里第6题已完整、后面第7题完整 => 必须同时输出第6题和第7题。',
    questionSelectionMode === 'all_visible'
      ? '8) 因为本次答案需要由模型生成，所以不要再根据答案是否跨页来决定是否丢题；题干以当前页可见内容为准。'
      : '',
    questionSelectionMode === 'all_visible'
      ? '9) 本次单页直提时，如与通用“完整性”约束冲突，以“当前页所有习题都要提取”为准。'
      : '',
    ...buildSharedQuestionContentRuleLines(
      questionSelectionMode === 'all_visible' ? 10 : 8,
      'questionsToUpsert',
      answerHandlingMode,
    ),
    ...buildSharedQuestionStructureInstructionLines(answerHandlingMode),
    '严格输出 JSON（不要 markdown，不要解释）：',
    '{',
    '  "chapter": {',
    '    "chapterTitle": "string or null",',
    '    "sectionTitle": "string or null",',
    '    "switchSectionTitle": "string or null",',
    '    "needReprocessSameImage": true/false,',
    '    "reason": "string"',
    '  },',
    '  "question": {',
    '    "questionsToUpsert": [ ...question objects... ],',
    '    "reason": "string"',
    '  }',
    '}',
  ].join('\n')

  const userContent: Array<Record<string, string>> = [{ type: 'input_text', text: instruction }]
  for (const dataUrl of imageDataUrls) {
    userContent.push({ type: 'input_image', image_url: dataUrl })
  }

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Model output is not JSON: ${text.slice(0, 500)}`)
  }
  let output: Record<string, unknown>
  try {
    output = parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    try {
      output = await regenerateModelJsonWithImagesByDoubao({
        imageDataUrls,
        originalInstruction: instruction,
        parseError,
        previousOutputText: text,
      })
    } catch (regenerateError) {
      const regenerateMsg = regenerateError instanceof Error ? regenerateError.message : String(regenerateError)
      try {
        output = await repairModelJsonByDoubao({
          brokenOutputText: text,
          parseError: `${parseError}; regenerate=${regenerateMsg}`,
        })
      } catch (repairError) {
        const repairMsg = repairError instanceof Error ? repairError.message : String(repairError)
        throw new Error(
          `Model JSON parse+regen+repair failed: parse=${parseError}; regenerate=${regenerateMsg}; repair=${repairMsg}`,
        )
      }
    }
  }
  const dataNode =
    output.data && typeof output.data === 'object' ? (output.data as Record<string, unknown>) : null
  const chapterNode =
    output.chapter && typeof output.chapter === 'object'
      ? (output.chapter as Record<string, unknown>)
      : dataNode && dataNode.chapter && typeof dataNode.chapter === 'object'
        ? (dataNode.chapter as Record<string, unknown>)
        : output
  const questionNode =
    output.question && typeof output.question === 'object'
      ? (output.question as Record<string, unknown>)
      : dataNode && dataNode.question && typeof dataNode.question === 'object'
        ? (dataNode.question as Record<string, unknown>)
        : output

  const chapterTitleRaw =
    (typeof chapterNode.chapterTitle === 'string' && chapterNode.chapterTitle) ||
    (typeof output.chapterTitle === 'string' && output.chapterTitle) ||
    ''
  const sectionTitleRaw =
    (typeof chapterNode.sectionTitle === 'string' && chapterNode.sectionTitle) ||
    (typeof output.sectionTitle === 'string' && output.sectionTitle) ||
    ''
  const switchSectionTitleRaw =
    (typeof chapterNode.switchSectionTitle === 'string' && chapterNode.switchSectionTitle) ||
    (typeof output.switchSectionTitle === 'string' && output.switchSectionTitle) ||
    ''
  const chapterReasonRaw =
    (typeof chapterNode.reason === 'string' && chapterNode.reason) ||
    (typeof output.reason === 'string' && output.reason) ||
    ''

  const questionsCandidateRaw: unknown =
    (Array.isArray(questionNode.questionsToUpsert) && questionNode.questionsToUpsert) ||
    (Array.isArray(questionNode.questions) && questionNode.questions) ||
    (Array.isArray((questionNode as Record<string, unknown>).questionList) &&
      (questionNode as Record<string, unknown>).questionList) ||
    (Array.isArray(output.questionsToUpsert) && output.questionsToUpsert) ||
    (Array.isArray(output.questions) && output.questions) ||
    (Array.isArray((output as Record<string, unknown>).questionList) &&
      (output as Record<string, unknown>).questionList) ||
    []
  const questionsCandidate = Array.isArray(questionsCandidateRaw) ? questionsCandidateRaw : []
  const questionReasonRaw =
    (typeof questionNode.reason === 'string' && questionNode.reason) ||
    (typeof output.reason === 'string' && output.reason) ||
    (dataNode && typeof dataNode.reason === 'string' ? dataNode.reason : '')

  return {
    chapter: {
      chapterTitle:
        typeof chapterTitleRaw === 'string' && normalizeTitle(chapterTitleRaw)
          ? normalizeTitle(chapterTitleRaw)
          : null,
      sectionTitle:
        typeof sectionTitleRaw === 'string' && normalizeTitle(sectionTitleRaw)
          ? normalizeTitle(sectionTitleRaw)
          : null,
      switchSectionTitle:
        typeof switchSectionTitleRaw === 'string' && normalizeTitle(switchSectionTitleRaw)
          ? normalizeTitle(switchSectionTitleRaw)
          : null,
      needReprocessSameImage:
        chapterNode.needReprocessSameImage === true || output.needReprocessSameImage === true,
      reason: typeof chapterReasonRaw === 'string' ? chapterReasonRaw : '',
    },
    question: {
      questionsToUpsert: questionsCandidate,
      needNextPage: false,
      continueQuestionKey: null,
      reason: typeof questionReasonRaw === 'string' ? questionReasonRaw : '',
      rawText: text,
    },
  }
}

async function detectLastQuestionContinuationWithLookaheadByDoubao(params: {
  queueImageDataUrls: string[]
  lookaheadImageDataUrl: string
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  boundaryQueueTailQuestionKey: string | null
  lookaheadImageLabel?: string | null
  retryHint?: string | null
}): Promise<LastQuestionLookaheadResult> {
  const {
    queueImageDataUrls,
    lookaheadImageDataUrl,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    boundaryQueueTailQuestionKey,
    lookaheadImageLabel = null,
    retryHint = null,
  } = params

  const instruction = [
    '你是最后一题续页确认器。你会看到前N张正式队列图片和最后1张预读图；正式队列事实只能来自前N张图，预读图只用于判断正式队列尾题是否延续。',
    `- 当前章标题: ${currentChapterTitle}`,
    `- 当前小节标题: ${currentSectionTitle}`,
    `- 当前小节 chapterId: ${currentSectionChapterId}`,
    `- 边界助手识别的正式队列尾题: ${boundaryQueueTailQuestionKey || 'null'}`,
    `- 预读页: ${lookaheadImageLabel || 'next_page_preview'}`,
    '规则:',
    '1) 前N张图才是当前队列；最后1张图只是下一页预读图，不属于当前队列，绝不能把预读图中的任何内容算进当前队列的完整性。',
    '2) 你必须先只根据前N张正式队列图片，识别 queueTailQuestionKey，即“正式队列里按阅读顺序最后实际出现的那一道顶层大题”；严禁把最后这张预读图里的题号或小节算进 queueTailQuestionKey。',
    '3) queueTailQuestionKey 必须使用这道正式队列尾题真实所属的小节；如果正式队列里没有出现新小节，不能因为预读图出现新小节就说当前队列已切换。',
    '3.1) “一、填空题”“二、选择题”“三、判断题”“四、计算题/证明题/解答题”等只是栏目标题或题型说明，不是顶层大题。',
    '3.2) 栏目标题下面的“1.、2.、3.”等编号题，每一道都是独立顶层大题；如果正式队列最后停在某个栏目内的编号题上，queueTailQuestionKey 返回这道编号题的定位，预读图只能判断这道编号题是否继续。',
    '4) 识别 queueTailQuestionKey 后，与边界助手识别的正式队列尾题对比；如果不一致，保留你只看正式队列得到的 queueTailQuestionKey，continueQuestionKey 返回 null，并在 reason 说明不一致。',
    '5) 只有当 queueTailQuestionKey 与边界助手尾题一致时，才允许查看预读图，并且只判断这同一道题是否继续到了预读页；不得用预读图去补齐当前队列、也不得据此把当前队列判成完整。',
    '6) 如果预读图页首仍在继续这道正式队列尾题，则 continueQuestionKey 必须返回与 queueTailQuestionKey 完全相同的定位。',
    '7) 如果正式队列尾题的后续小问、后续答案、收尾结论只出现在预读图里，这说明正式队列未完成，continueQuestionKey 必须返回 queueTailQuestionKey，不能返回 null。',
    '8) 如果预读图没有继续这道正式队列尾题，则 continueQuestionKey 返回 null。',
    '9) 预读图里出现的新题、后续题、其他更大的题号，统统不能当作正式队列最后一题，也不能直接当作 continueQuestionKey。',
    '10) 典型场景：若正式队列实际只到第3题，预读页里后面又出现第4题、第5题，也绝不能把第5题当成正式队列最后一题；你只能判断第3题是否在预读页继续。',
    '11) 典型场景：当前队列里第1题只完整到前7个小问，而第8-10小问在预读页里才出现；这种情况下 queueTailQuestionKey 和 continueQuestionKey 都必须仍然是第1题，因为预读页不属于正式队列。',
    '12) reason 必须分两步写清楚：先说明“仅看前N张正式队列图”识别出的最后一题，再说明它与边界助手尾题是否一致、预读页页首是否继续这道题；不得只根据预读页内容倒推。',
    retryHint ? `重判要求: ${retryHint}` : '',
    '严格输出 JSON：',
    '{',
    '  "question": {',
    '    "queueTailQuestionKey": "string or null",',
    '    "continueQuestionKey": "string or null",',
    '    "reason": "string"',
    '  }',
    '}',
  ].join('\n')

  const userContent: Array<Record<string, string>> = [{ type: 'input_text', text: instruction }]
  for (const dataUrl of queueImageDataUrls) {
    userContent.push({ type: 'input_image', image_url: dataUrl })
  }
  userContent.push({ type: 'input_image', image_url: lookaheadImageDataUrl })

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Lookahead output is not JSON: ${text.slice(0, 500)}`)
  }

  let output: Record<string, unknown>
  try {
    output = parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    output = await regenerateModelJsonWithImagesByDoubao({
      imageDataUrls: [...queueImageDataUrls, lookaheadImageDataUrl],
      originalInstruction: instruction,
      parseError,
      previousOutputText: text,
    })
  }

  const questionRaw =
    output.question && typeof output.question === 'object' ? (output.question as Record<string, unknown>) : {}
  const queueTailQuestionKey = readQuestionKeyField(questionRaw, [
    'queueTailQuestionKey',
    'currentQueueTailQuestionKey',
    'tailQuestionKey',
    'lastQuestionKey',
  ])
  const continueQuestionKey = readQuestionKeyField(questionRaw, ['continueQuestionKey'])

  return {
    queueTailQuestionKey,
    continueQuestionKey,
    reason: typeof questionRaw.reason === 'string' ? questionRaw.reason : '',
    rawText: text,
  }
}

async function detectQuestionsByDoubao(params: {
  imageDataUrls: string[]
  currentChapterTitle: string
  currentSectionTitle: string
  currentSectionChapterId: string
  mode: 'single_page' | 'cross_page_merge'
  retryHint?: string
}): Promise<QuestionExtractResult> {
  const {
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    mode,
    retryHint,
  } = params

  const combined = await detectChapterAndQuestionsByDoubao({
    imageDataUrls,
    currentChapterTitle,
    currentSectionTitle,
    currentSectionChapterId,
    afterSwitchMode: false,
    mode,
    retryHint,
  })

  return combined.question
}

async function appendChapterSegmentFromImages(params: {
  jsonFilePath: string
  chapterTitle: string
  sectionTitle: string
  imageDataUrls: string[]
  imageLabels?: string[]
}) {
  const {
    jsonFilePath,
    chapterTitle,
    sectionTitle,
    imageDataUrls,
    imageLabels = [],
  } = params

  const payload = await loadTextbookJson(jsonFilePath)
  const normalizedChapterTitle = normalizeTitle(chapterTitle)
  const normalizedSectionTitle = normalizeTitle(sectionTitle)
  const chapter = ensureTopChapter(payload, normalizedChapterTitle)
  const section = ensureSectionChapter(payload, chapter.chapterId, normalizedSectionTitle)
  const answerHandlingMode = getPayloadAnswerHandlingMode(payload)
  const questionSelectionMode = answerHandlingMode === 'extract_visible' ? 'complete_only' : 'all_visible'
  const mode: 'single_page' | 'cross_page_merge' = imageDataUrls.length > 1 ? 'cross_page_merge' : 'single_page'

  const extractDetect = await detectChapterAndQuestionsByDoubao({
    imageDataUrls,
    currentChapterTitle: normalizedChapterTitle,
    currentSectionTitle: normalizedSectionTitle,
    currentSectionChapterId: section.chapterId,
    afterSwitchMode: false,
    mode,
    answerHandlingMode,
    questionSelectionMode,
    fixedChapterSection: true,
    allowLargeImageBatch: true,
  })

  const rawQuestions = Array.isArray(extractDetect.question.questionsToUpsert)
    ? extractDetect.question.questionsToUpsert
    : []
  if (!rawQuestions.length) {
    throw new Error(extractDetect.question.reason || '当前片段没有提取到可写入的题目')
  }

  let normalizedQuestions = rawQuestions
    .map((item) =>
      normalizeQuestionItem(item, section.chapterId, normalizedSectionTitle, {
        answerHandlingMode,
      }),
    )
    .filter(Boolean) as QuestionItem[]
  normalizedQuestions = rewriteQuestionTitlesByResolvedChapter(payload, normalizedQuestions)

  const pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)
  upsertQuestionsById(payload, normalizedQuestions)
  await appendPendingReviewLogs('manual_segment', pendingReviewLogs)
  await saveTextbookJson(jsonFilePath, payload)

  return {
    message: 'success',
    jsonFilePath,
    currentChapterTitle: normalizedChapterTitle,
    currentSectionTitle: normalizedSectionTitle,
    currentSectionChapterId: section.chapterId,
    chaptersCount: payload.chapters.length,
    questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
    question: {
      pending: false,
      reason: extractDetect.question.reason || '',
      processingStartQuestionKey: null,
      nextStartQuestionKey: null,
      pendingPagesCount: 0,
      pendingPageLabels: [],
      upsertedCount: normalizedQuestions.length,
      pendingReviewCount: pendingReviewLogs.length,
      droppedPendingQuestionCount: 0,
      boundaryHasExtractableQuestions: rawQuestions.length > 0,
      boundaryNeedNextPage: false,
      boundaryContinueQuestionKey: null,
      boundaryLookaheadLabel: null,
      boundaryLookaheadReason: '手工分段模式按整段图片一次处理，不做预读判断。',
      boundaryReason: '手工分段模式固定章/小节并按整段图片一次提取。',
      extractReason: extractDetect.question.reason || '',
      retryExtractReason: '',
      integrityRetryReason: '',
      rangeRetryReason: '',
      extractReturnedCount: rawQuestions.length,
      normalizedCount: normalizedQuestions.length,
      sessionStoredProcessingStartQuestionKey: null,
      sessionStoredPendingContinueQuestionKey: null,
      effectiveProcessingStartQuestionKey: null,
      effectiveExtractEndBeforeQuestionKey: null,
      effectiveExtractMode: 'manual_segment',
      integrityFixRetried: false,
      pendingReviewFixRetried: false,
      rangeFixRetried: false,
      rangeMismatchBlocked: false,
      rawText: extractDetect.question.rawText,
      retried: false,
    },
    segment: {
      chapterTitle: normalizedChapterTitle,
      sectionTitle: normalizedSectionTitle,
      imageCount: imageDataUrls.length,
      imageLabels: imageLabels.filter((item) => typeof item === 'string' && item.trim()),
      upsertedCount: normalizedQuestions.length,
    },
    passLogs: [
      {
        pass: 1,
        chapterTitle: normalizedChapterTitle,
        sectionTitle: normalizedSectionTitle,
        switched: false,
        needReprocessSameImage: false,
        reason: '手工分段模式固定章节与小节',
        question: {
          mode: 'manual_segment',
          pending: false,
          reason: extractDetect.question.reason || '',
          upsertedCount: normalizedQuestions.length,
          extractReturnedCount: rawQuestions.length,
          normalizedCount: normalizedQuestions.length,
          imageCount: imageDataUrls.length,
          imageLabels: imageLabels.filter((item) => typeof item === 'string' && item.trim()),
        },
      },
    ],
  }
}

async function processChapterSessionImage(params: {
  sessionId: string
  imageDataUrl: string
  imageLabel?: string
  lookaheadImageDataUrl?: string
  lookaheadImageLabel?: string
  overrideChapterTitle?: string
  overrideSectionTitle?: string
}) {
  const {
    sessionId,
    imageDataUrl,
    imageLabel = '',
    lookaheadImageDataUrl = '',
    lookaheadImageLabel = '',
    overrideChapterTitle = '',
    overrideSectionTitle = '',
  } = params
  const session = await getChapterSession(sessionId)
  if (!session) {
    throw new Error('session not found, please init first')
  }

  if (overrideChapterTitle.trim()) {
    session.currentChapterTitle = normalizeTitle(overrideChapterTitle)
  }
  if (overrideSectionTitle.trim()) {
    session.currentSectionTitle = normalizeTitle(overrideSectionTitle)
  }

  const payload = await loadTextbookJson(session.jsonFilePath)

  let activeChapterTitle = normalizeTitle(session.currentChapterTitle)
  let activeSectionTitle = normalizeTitle(session.currentSectionTitle)
  const pageEntryChapterTitle = activeChapterTitle
  const pageEntrySectionTitle = activeSectionTitle
  const passLogs: Array<Record<string, unknown>> = []

  const initialTopChapter = ensureTopChapter(payload, activeChapterTitle)
  const initialSection = ensureSectionChapter(payload, initialTopChapter.chapterId, activeSectionTitle)
  let activeSectionChapterId = initialSection.chapterId
  const questionSession = (await getQuestionSession(sessionId)) || {
    sessionId,
    jsonFilePath: session.jsonFilePath,
    currentChapterTitle: activeChapterTitle,
    currentSectionTitle: activeSectionTitle,
    currentSectionChapterId: initialSection.chapterId,
    pendingPageDataUrls: [],
    pendingPageLabels: [],
    pendingContinueQuestionKey: null,
    processingStartQuestionKey: null,
    pendingReason: null,
    pendingUpsertedCount: 0,
    updatedAt: new Date().toISOString(),
  }
  const answerHandlingMode = getPayloadAnswerHandlingMode(payload)
  const sessionStoredProcessingStartQuestionKey = questionSession.processingStartQuestionKey
  const sessionStoredPendingContinueQuestionKey = questionSession.pendingContinueQuestionKey

  if (answerHandlingMode !== 'extract_visible') {
    const extractDetect = await detectChapterAndQuestionsByDoubao({
      imageDataUrls: [imageDataUrl],
      currentChapterTitle: activeChapterTitle,
      currentSectionTitle: activeSectionTitle,
      currentSectionChapterId: activeSectionChapterId,
      afterSwitchMode: false,
      mode: 'single_page',
      answerHandlingMode,
      questionSelectionMode: 'all_visible',
    })

    let chapterTitle = extractDetect.chapter.chapterTitle || activeChapterTitle
    let sectionTitle = extractDetect.chapter.sectionTitle || activeSectionTitle
    const switchSectionTitle = extractDetect.chapter.switchSectionTitle
    let chapter = ensureTopChapter(payload, chapterTitle)
    let section = ensureSectionChapter(payload, chapter.chapterId, sectionTitle)
    activeChapterTitle = chapterTitle
    activeSectionTitle = sectionTitle
    activeSectionChapterId = section.chapterId

    let switched = false
    if (switchSectionTitle && normalizeTitle(switchSectionTitle) !== normalizeTitle(activeSectionTitle)) {
      const switchedSection = ensureSectionChapter(payload, chapter.chapterId, switchSectionTitle)
      activeSectionTitle = normalizeTitle(switchSectionTitle)
      activeSectionChapterId = switchedSection.chapterId
      switched = true
    }

    const rawQuestions = Array.isArray(extractDetect.question.questionsToUpsert)
      ? extractDetect.question.questionsToUpsert
      : []
    let normalizedQuestions = rawQuestions
      .map((item) =>
        normalizeQuestionItem(item, section.chapterId, sectionTitle, {
          answerHandlingMode,
          forceFallbackChapterId: false,
        }),
      )
      .filter(Boolean) as QuestionItem[]
    normalizedQuestions = rewriteQuestionTitlesByResolvedChapter(payload, normalizedQuestions)

    const pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)
    upsertQuestionsById(payload, normalizedQuestions)
    await appendPendingReviewLogs(sessionId, pendingReviewLogs)

    questionSession.currentChapterTitle = activeChapterTitle
    questionSession.currentSectionTitle = activeSectionTitle
    questionSession.currentSectionChapterId = activeSectionChapterId
    questionSession.pendingPageDataUrls = []
    questionSession.pendingPageLabels = []
    questionSession.pendingContinueQuestionKey = null
    questionSession.processingStartQuestionKey = null
    questionSession.pendingReason = null
    questionSession.pendingUpsertedCount = 0

    passLogs.push({
      pass: 1,
      chapterTitle: activeChapterTitle,
      sectionTitle,
      switchSectionTitle: switchSectionTitle ?? null,
      switched,
      needReprocessSameImage: false,
      reason: extractDetect.chapter.reason,
      question: {
        mode: 'single_page_no_answer_direct',
        pending: false,
        reason: extractDetect.question.reason,
        processingStartQuestionKey: null,
        nextStartQuestionKey: null,
        continueQuestionKey: null,
        upsertedCount: normalizedQuestions.length,
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: 0,
        pendingPageLabels: [],
        boundaryHasExtractableQuestions: rawQuestions.length > 0,
        boundaryNeedNextPage: false,
        boundaryContinueQuestionKey: null,
        boundaryLookaheadLabel: null,
        boundaryLookaheadReason: '无答案教材跳过预读判断，直接按当前页提取所有习题。',
        boundaryReason: '无答案教材跳过跨页边界判断，直接按当前页提取所有习题。',
        extractReason: extractDetect.question.reason,
        retryExtractReason: '',
        integrityRetryReason: '',
        rangeRetryReason: '',
        extractReturnedCount: rawQuestions.length,
        normalizedCount: normalizedQuestions.length,
        sessionStoredProcessingStartQuestionKey,
        sessionStoredPendingContinueQuestionKey,
        effectiveProcessingStartQuestionKey: null,
        effectiveExtractEndBeforeQuestionKey: null,
        effectiveExtractMode: 'single_page_no_answer_direct',
        integrityFixRetried: false,
        pendingReviewFixRetried: false,
        rangeFixRetried: false,
        rangeMismatchBlocked: false,
        rawText: extractDetect.question.rawText,
        retried: false,
      },
    })

    const activeTopChapter = ensureTopChapter(payload, activeChapterTitle)
    const activeSection = ensureSectionChapter(payload, activeTopChapter.chapterId, activeSectionTitle)

    await saveTextbookJson(session.jsonFilePath, payload)
    session.currentChapterTitle = activeChapterTitle
    session.currentSectionTitle = activeSectionTitle
    session.updatedAt = new Date().toISOString()
    await setChapterSession(sessionId, session)
    questionSession.updatedAt = new Date().toISOString()
    await setQuestionSession(sessionId, questionSession)

    return {
      message: 'success',
      sessionId,
      jsonFilePath: session.jsonFilePath,
      currentChapterTitle: session.currentChapterTitle,
      currentSectionTitle: session.currentSectionTitle,
      currentSectionChapterId: activeSection.chapterId,
      chaptersCount: payload.chapters.length,
      questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
      passLogs,
      question: {
        pending: false,
        reason: extractDetect.question.reason,
        processingStartQuestionKey: null,
        nextStartQuestionKey: null,
        pendingPagesCount: 0,
        pendingPageLabels: [],
        upsertedCount: normalizedQuestions.length,
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: 0,
        boundaryHasExtractableQuestions: rawQuestions.length > 0,
        boundaryNeedNextPage: false,
        boundaryContinueQuestionKey: null,
        boundaryLookaheadLabel: null,
        boundaryLookaheadReason: '无答案教材跳过预读判断，直接按当前页提取所有习题。',
        boundaryReason: '无答案教材跳过跨页边界判断，直接按当前页提取所有习题。',
        extractReason: extractDetect.question.reason,
        retryExtractReason: '',
        integrityRetryReason: '',
        rangeRetryReason: '',
        extractReturnedCount: rawQuestions.length,
        normalizedCount: normalizedQuestions.length,
        sessionStoredProcessingStartQuestionKey,
        sessionStoredPendingContinueQuestionKey,
        effectiveProcessingStartQuestionKey: null,
        effectiveExtractEndBeforeQuestionKey: null,
        effectiveExtractMode: 'single_page_no_answer_direct',
        integrityFixRetried: false,
        pendingReviewFixRetried: false,
        rangeFixRetried: false,
        rangeMismatchBlocked: false,
        questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
        rawText: extractDetect.question.rawText,
        retried: false,
      },
    }
  }

  let pendingPageDataUrls = Array.isArray(questionSession.pendingPageDataUrls)
    ? questionSession.pendingPageDataUrls.filter((item) => typeof item === 'string' && item.trim())
    : []
  let pendingPageLabels = Array.isArray(questionSession.pendingPageLabels)
    ? questionSession.pendingPageLabels.filter((item) => typeof item === 'string' && item.trim())
    : []
  if (pendingPageDataUrls.length > MAX_PENDING_QUEUE_PAGES - 1) {
    pendingPageDataUrls = pendingPageDataUrls.slice(-(MAX_PENDING_QUEUE_PAGES - 1))
    pendingPageLabels = pendingPageLabels.slice(-(MAX_PENDING_QUEUE_PAGES - 1))
  }
  let pendingContinueQuestionKey = questionSession.pendingContinueQuestionKey
  const processingStartQuestionKey =
    questionSession.processingStartQuestionKey || questionSession.pendingContinueQuestionKey
  const mode: 'single_page' | 'cross_page_merge' = pendingPageDataUrls.length ? 'cross_page_merge' : 'single_page'
  const questionImageDataUrls = pendingPageDataUrls.length
    ? [...pendingPageDataUrls, imageDataUrl]
    : [imageDataUrl]
  const questionImageLabels = pendingPageLabels.length ? [...pendingPageLabels, imageLabel || 'current'] : [imageLabel || 'current']
  if (mode === 'cross_page_merge' && (questionImageDataUrls.length < 2 || questionImageDataUrls.length > MAX_PENDING_QUEUE_PAGES)) {
    throw new Error(`cross_page_merge requires 2-${MAX_PENDING_QUEUE_PAGES} images`)
  }
  const crossPageContext =
    mode === 'cross_page_merge'
      ? buildCrossPageContext({
          processingStartQuestionKey,
          pendingContinueQuestionKey,
          pendingReason: questionSession.pendingReason,
          pendingUpsertedCount: questionSession.pendingUpsertedCount,
          pendingPagesCount: pendingPageDataUrls.length,
          pendingPageLabels,
        })
      : ''

  let boundaryDetect = await detectChapterBoundaryAndPendingByDoubao({
    imageDataUrls: questionImageDataUrls,
    currentChapterTitle: activeChapterTitle,
    currentSectionTitle: activeSectionTitle,
    currentSectionChapterId: activeSectionChapterId,
    mode,
    processingStartQuestionKey,
    pendingContinueQuestionKey,
    crossPageContext,
  })
  let boundaryRetryReason = ''
  const boundaryScopeMismatch = detectBoundaryReasonScopeMismatch({
    boundaryReason: boundaryDetect.question.reason,
    processingStartQuestionKey,
  })
  if (boundaryScopeMismatch.shouldRetry) {
    const boundaryRetryDetect = await detectChapterBoundaryAndPendingByDoubao({
      imageDataUrls: questionImageDataUrls,
      currentChapterTitle: activeChapterTitle,
      currentSectionTitle: activeSectionTitle,
      currentSectionChapterId: activeSectionChapterId,
      mode,
      processingStartQuestionKey,
      pendingContinueQuestionKey,
      crossPageContext,
      retryHint: `${boundaryScopeMismatch.reason} 从当前处理起点开始判断 hasExtractableQuestions 和 needNextPage，不要再把起点之前的题算入当前范围。`,
    })
    boundaryRetryReason = boundaryRetryDetect.question.reason || ''
    boundaryDetect = boundaryRetryDetect
  }

  let chapterDetect: ChapterDetectResult = {
    chapterTitle: null,
    sectionTitle: null,
    switchSectionTitle: null,
    needReprocessSameImage: false,
    reason: '',
  }
  let finalQuestionDetect: QuestionExtractResult = {
    questionsToUpsert: [],
    needNextPage: boundaryDetect.question.needNextPage,
    continueQuestionKey: boundaryDetect.question.continueQuestionKey,
    reason: boundaryDetect.question.reason,
    rawText: boundaryDetect.question.rawText,
  }
  let retried = false

  let chapterTitle = activeChapterTitle
  let sectionTitle = activeSectionTitle
  let switched = false
  let chapter = ensureTopChapter(payload, chapterTitle)
  let section = ensureSectionChapter(payload, chapter.chapterId, sectionTitle)

  const boundaryContinueKey = resolveContinueQuestionKey(boundaryDetect.question.continueQuestionKey)
  const boundaryQueueTailQuestionKey =
    resolveContinueQuestionKey(boundaryDetect.question.queueTailQuestionKey) || boundaryContinueKey || null
  let effectiveBoundaryContinueKey: string | null = boundaryContinueKey || null
  let lookaheadAdjustedContinueQuestionKey: string | null = boundaryContinueKey || null
  let lookaheadQueueTailQuestionKey: string | null = null
  let boundaryLookaheadReason = ''
  if (lookaheadImageDataUrl && boundaryQueueTailQuestionKey) {
    try {
      let lookaheadDetect = await detectLastQuestionContinuationWithLookaheadByDoubao({
        queueImageDataUrls: questionImageDataUrls,
        lookaheadImageDataUrl,
        currentChapterTitle: activeChapterTitle,
        currentSectionTitle: activeSectionTitle,
        currentSectionChapterId: activeSectionChapterId,
        boundaryQueueTailQuestionKey,
        lookaheadImageLabel: lookaheadImageLabel || null,
      })
      boundaryLookaheadReason = lookaheadDetect.reason || ''
      lookaheadQueueTailQuestionKey = resolveContinueQuestionKey(lookaheadDetect.queueTailQuestionKey) || null
      let lookaheadContinueKey = resolveContinueQuestionKey(lookaheadDetect.continueQuestionKey) || null
      let lookaheadDecision = shouldAcceptLookaheadContinueQuestionKey({
        lookaheadTailQuestionKey: lookaheadQueueTailQuestionKey,
        boundaryQueueTailQuestionKey,
        lookaheadContinueKey,
        boundaryContinueKey,
        boundaryReason: boundaryDetect.question.reason,
        currentSectionTitle: activeSectionTitle,
      })
      if (!lookaheadDecision.accepted) {
        const retryDetect = await detectLastQuestionContinuationWithLookaheadByDoubao({
          queueImageDataUrls: questionImageDataUrls,
          lookaheadImageDataUrl,
          currentChapterTitle: activeChapterTitle,
          currentSectionTitle: activeSectionTitle,
          currentSectionChapterId: activeSectionChapterId,
          boundaryQueueTailQuestionKey,
          lookaheadImageLabel: lookaheadImageLabel || null,
          retryHint:
            `${lookaheadDecision.reason} 请重新只看前N张正式队列图来复核 queueTailQuestionKey；它应与边界助手尾题一致。预读页只能用于判断这道题是否延续，不能引入预读页的新题号或新小节。`,
        })
        lookaheadDetect = retryDetect
        lookaheadQueueTailQuestionKey = resolveContinueQuestionKey(lookaheadDetect.queueTailQuestionKey) || null
        lookaheadContinueKey = resolveContinueQuestionKey(lookaheadDetect.continueQuestionKey) || null
        boundaryLookaheadReason = [boundaryLookaheadReason, `重判: ${lookaheadDetect.reason || ''}`]
          .filter(Boolean)
          .join(' | ')
        lookaheadDecision = shouldAcceptLookaheadContinueQuestionKey({
          lookaheadTailQuestionKey: lookaheadQueueTailQuestionKey,
          boundaryQueueTailQuestionKey,
          lookaheadContinueKey,
          boundaryContinueKey,
          boundaryReason: boundaryDetect.question.reason,
          currentSectionTitle: activeSectionTitle,
        })
      }
      if (lookaheadDecision.accepted) {
        effectiveBoundaryContinueKey = lookaheadContinueKey
        lookaheadAdjustedContinueQuestionKey = effectiveBoundaryContinueKey
      } else {
        boundaryLookaheadReason = [boundaryLookaheadReason, lookaheadDecision.reason].filter(Boolean).join(' | ')
        effectiveBoundaryContinueKey = boundaryContinueKey || null
        lookaheadAdjustedContinueQuestionKey = effectiveBoundaryContinueKey
      }
    } catch (error) {
      boundaryLookaheadReason = error instanceof Error ? `预读判断失败: ${error.message}` : `预读判断失败: ${String(error)}`
    }
  } else if (lookaheadImageDataUrl) {
    boundaryLookaheadReason = '边界助手未返回正式队列尾题，跳过预读判断。'
  }
  let pendingFiltered = { filtered: [] as QuestionItem[], droppedCount: 0 }
  let normalizedQuestions: QuestionItem[] = []
  let pendingReviewLogs: Array<Record<string, string>> = []
  let pendingReviewFixRetried = false
  let integrityFixRetried = false
  let extractReason = ''
  let retryExtractReason = ''
  let integrityRetryReason = ''
  let rangeRetryReason = ''
  let extractReturnedCount = 0
  let normalizedCount = 0
  let rangeFixRetried = false
  let rangeMismatchBlocked = false

  if (boundaryDetect.question.hasExtractableQuestions) {
    let questionsRaw: unknown[] = []
    const extractDetect = await detectChapterAndQuestionsByDoubao({
      imageDataUrls: questionImageDataUrls,
      currentChapterTitle: chapterTitle,
      currentSectionTitle: sectionTitle,
      currentSectionChapterId: section.chapterId,
      afterSwitchMode: false,
      mode,
      processingStartQuestionKey,
      extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
      answerHandlingMode,
    })
    finalQuestionDetect = {
      ...extractDetect.question,
      needNextPage: Boolean(effectiveBoundaryContinueKey),
      continueQuestionKey: effectiveBoundaryContinueKey || null,
      reason: boundaryDetect.question.reason || extractDetect.question.reason,
    }
    extractReason = extractDetect.question.reason || ''
    chapterDetect = extractDetect.chapter
    questionsRaw = finalQuestionDetect.questionsToUpsert
    extractReturnedCount = Array.isArray(questionsRaw) ? questionsRaw.length : 0

    if (!questionsRaw.length) {
      const retryDetect = await detectChapterAndQuestionsByDoubao({
        imageDataUrls: questionImageDataUrls,
        currentChapterTitle: chapterTitle,
        currentSectionTitle: sectionTitle,
        currentSectionChapterId: section.chapterId,
        afterSwitchMode: false,
        mode,
        processingStartQuestionKey,
        extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
        answerHandlingMode,
        retryHint:
          '边界判断已确认当前队列存在可完整入库的题目。请严格按起点开始提取，只输出可入库范围内的完整题，禁止输出跨页题。',
      })
      finalQuestionDetect = {
        ...retryDetect.question,
        needNextPage: Boolean(effectiveBoundaryContinueKey),
        continueQuestionKey: effectiveBoundaryContinueKey || null,
        reason: boundaryDetect.question.reason || retryDetect.question.reason,
      }
      retryExtractReason = retryDetect.question.reason || ''
      chapterDetect = retryDetect.chapter
      questionsRaw = finalQuestionDetect.questionsToUpsert
      extractReturnedCount = Array.isArray(questionsRaw) ? questionsRaw.length : 0
      retried = true
    }

    if (!questionsRaw.length) {
      const conflictRetryDetect = await detectChapterAndQuestionsByDoubao({
        imageDataUrls: questionImageDataUrls,
        currentChapterTitle: chapterTitle,
        currentSectionTitle: sectionTitle,
        currentSectionChapterId: section.chapterId,
        afterSwitchMode: false,
        mode,
        processingStartQuestionKey,
        extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
        answerHandlingMode,
        retryHint: buildBoundaryExtractorConflictRetryHint({
          boundaryReason: boundaryDetect.question.reason,
          boundaryRawText: boundaryDetect.question.rawText,
          previousExtractReason: retryExtractReason || extractReason,
          previousExtractRawText: finalQuestionDetect.rawText,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
        }),
      })
      finalQuestionDetect = {
        ...conflictRetryDetect.question,
        needNextPage: Boolean(effectiveBoundaryContinueKey),
        continueQuestionKey: effectiveBoundaryContinueKey || null,
        reason: boundaryDetect.question.reason || conflictRetryDetect.question.reason,
      }
      retryExtractReason = [retryExtractReason, conflictRetryDetect.question.reason].filter(Boolean).join(' | ')
      chapterDetect = conflictRetryDetect.chapter
      questionsRaw = finalQuestionDetect.questionsToUpsert
      extractReturnedCount = Array.isArray(questionsRaw) ? questionsRaw.length : 0
      retried = true
    }

    if (!questionsRaw.length) {
      throw new Error('Boundary detected extractable questions, but extractor returned no questions after conflict repair')
    }

    const normalizedQuestionsAll = questionsRaw
      .map((item) =>
        normalizeQuestionItem(item, section.chapterId, sectionTitle, {
          answerHandlingMode,
          forceFallbackChapterId: false,
        }),
      )
      .filter(Boolean) as QuestionItem[]
    pendingFiltered = {
      filtered: normalizedQuestionsAll,
      droppedCount: 0,
    }
    normalizedQuestions = pendingFiltered.filtered
    normalizedCount = normalizedQuestions.length
    let rangeMismatch = detectExtractorRangeMismatch({
      boundaryReason: boundaryDetect.question.reason,
      processingStartQuestionKey,
      extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
      extractReason,
      normalizedQuestions,
    })

    if (rangeMismatch.shouldRetry) {
      rangeFixRetried = true
      try {
        const rangeRetryDetect = await detectChapterAndQuestionsByDoubao({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          answerHandlingMode,
          retryHint: `${rangeMismatch.reason} 结构化范围约束：endBeforeQuestionKey=${effectiveBoundaryContinueKey || 'null'}。如果 endBeforeQuestionKey 为 null，严禁把 startQuestionKey 当作截止题号，必须继续提取起点之后所有完整顶层大题。`,
        })
        rangeRetryReason = rangeRetryDetect.question.reason || ''
        const rangeRetryRaw = rangeRetryDetect.question.questionsToUpsert
        const rangeRetryNormalized = rangeRetryRaw
          .map((item) =>
            normalizeQuestionItem(item, section.chapterId, sectionTitle, {
              answerHandlingMode,
              forceFallbackChapterId: false,
            }),
          )
          .filter(Boolean) as QuestionItem[]
        const rangeRetryMismatch = detectExtractorRangeMismatch({
          boundaryReason: boundaryDetect.question.reason,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          extractReason: rangeRetryDetect.question.reason || '',
          normalizedQuestions: rangeRetryNormalized,
        })
        if (rangeRetryNormalized.length && !rangeRetryMismatch.shouldRetry) {
          normalizedQuestions = rangeRetryNormalized
          normalizedCount = normalizedQuestions.length
          finalQuestionDetect.rawText = rangeRetryDetect.question.rawText
          pendingFiltered = {
            filtered: normalizedQuestions,
            droppedCount: 0,
          }
          rangeMismatch = { shouldRetry: false, reason: '' }
        } else {
          rangeMismatch = rangeRetryMismatch
        }
      } catch (error) {
        rangeRetryReason = error instanceof Error ? error.message : String(error)
      }
    }

    if (rangeMismatch.shouldRetry) {
      rangeMismatchBlocked = true
      normalizedQuestions = []
      normalizedCount = 0
      pendingFiltered = {
        filtered: [],
        droppedCount: 0,
      }
      effectiveBoundaryContinueKey =
        boundaryContinueKey || processingStartQuestionKey || pendingContinueQuestionKey || null
      finalQuestionDetect = {
        ...finalQuestionDetect,
        questionsToUpsert: [],
        needNextPage: true,
        continueQuestionKey: effectiveBoundaryContinueKey,
        reason: `${rangeMismatch.reason} 为避免错误入库，保留当前队列并等待下一页再次判断。`,
      }
    }

    pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)

    if (!rangeMismatchBlocked && pendingReviewLogs.length > 0) {
      pendingReviewFixRetried = true
      try {
        const fixDetect = await detectChapterAndQuestionsByDoubao({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          answerHandlingMode,
          retryHint: `上一轮提取结果含有 ${pendingReviewLogs.length} 处【待校对】。请重新看图并仅修复这些位置，严格保持提取范围不变。`,
        })
        const fixRaw = fixDetect.question.questionsToUpsert
        const fixAll = fixRaw
          .map((item) =>
            normalizeQuestionItem(item, section.chapterId, sectionTitle, {
              answerHandlingMode,
              forceFallbackChapterId: false,
            }),
          )
          .filter(Boolean) as QuestionItem[]
        const fixNormalized = fixAll
        const fixPendingLogs = collectPendingReviewLogs(fixNormalized)
        if (fixNormalized.length && fixPendingLogs.length <= pendingReviewLogs.length) {
          normalizedQuestions = fixNormalized
          normalizedCount = normalizedQuestions.length
          pendingReviewLogs = fixPendingLogs
          finalQuestionDetect.rawText = fixDetect.question.rawText
          pendingFiltered = {
            filtered: fixNormalized,
            droppedCount: 0,
          }
        }
      } catch {
        // Ignore fix attempt failure and keep first extraction result.
      }
    }

    const integrityCheckOptions = {
      expectAnswer: true,
      allowBlankCodeAnswer: false,
    }
    let integrityIssue = rangeMismatchBlocked ? null : detectQuestionIntegrityIssue(normalizedQuestions, integrityCheckOptions)
    if (!rangeMismatchBlocked && integrityIssue) {
      integrityFixRetried = true
      try {
        const integrityRetryDetect = await detectChapterAndQuestionsByDoubao({
          imageDataUrls: questionImageDataUrls,
          currentChapterTitle: chapterTitle,
          currentSectionTitle: sectionTitle,
          currentSectionChapterId: section.chapterId,
          afterSwitchMode: false,
          mode,
          processingStartQuestionKey,
          extractEndBeforeQuestionKey: effectiveBoundaryContinueKey || null,
          answerHandlingMode,
          retryHint: `上一轮提取结果不完整：${integrityIssue.reason}。请重新看图，完整输出这道题所有可见小问和答案；若仍未完整结束则不要输出这道题。`,
        })
        const integrityRetryRaw = integrityRetryDetect.question.questionsToUpsert
        const integrityRetryNormalized = integrityRetryRaw
          .map((item) =>
            normalizeQuestionItem(item, section.chapterId, sectionTitle, {
              answerHandlingMode,
              forceFallbackChapterId: false,
            }),
          )
          .filter(Boolean) as QuestionItem[]
        const retriedIssue = detectQuestionIntegrityIssue(integrityRetryNormalized, integrityCheckOptions)
        integrityRetryReason = integrityRetryDetect.question.reason || ''
        if (integrityRetryNormalized.length && !retriedIssue) {
          normalizedQuestions = integrityRetryNormalized
          normalizedCount = normalizedQuestions.length
          pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)
          finalQuestionDetect.rawText = integrityRetryDetect.question.rawText
          pendingFiltered = {
            filtered: normalizedQuestions,
            droppedCount: 0,
          }
          integrityIssue = null
        }
      } catch {
        // Ignore integrity retry failure and keep current extraction result.
      }
    }

    const unresolvedIntegrityIssue = rangeMismatchBlocked ? null : detectQuestionIntegrityIssue(normalizedQuestions, integrityCheckOptions)
    if (unresolvedIntegrityIssue) {
      pendingFiltered = {
        filtered: normalizedQuestions.slice(0, unresolvedIntegrityIssue.index),
        droppedCount: Math.max(0, normalizedQuestions.length - unresolvedIntegrityIssue.index),
      }
      normalizedQuestions = pendingFiltered.filtered
      effectiveBoundaryContinueKey = unresolvedIntegrityIssue.continueKey
      finalQuestionDetect = {
        ...finalQuestionDetect,
        needNextPage: true,
        continueQuestionKey: unresolvedIntegrityIssue.continueKey,
        reason: unresolvedIntegrityIssue.reason,
      }
      pendingReviewLogs = collectPendingReviewLogs(normalizedQuestions)
    }

    if (!rangeMismatchBlocked && shouldClearTrailingPendingAfterExtraction(normalizedQuestions, effectiveBoundaryContinueKey)) {
      effectiveBoundaryContinueKey = null
      finalQuestionDetect = {
        ...finalQuestionDetect,
        needNextPage: false,
        continueQuestionKey: null,
      }
    }

  } else {
    finalQuestionDetect = {
      questionsToUpsert: [],
      needNextPage: true,
      continueQuestionKey: effectiveBoundaryContinueKey || null,
      reason: boundaryDetect.question.reason,
      rawText: boundaryDetect.question.rawText,
    }
  }

  chapterTitle = chapterDetect.chapterTitle || activeChapterTitle
  const switchSectionTitle = chapterDetect.switchSectionTitle
  sectionTitle =
    switchSectionTitle && normalizeTitle(chapterTitle) === normalizeTitle(pageEntryChapterTitle)
      ? pageEntrySectionTitle
      : chapterDetect.sectionTitle || activeSectionTitle
  chapter = ensureTopChapter(payload, chapterTitle)
  section = ensureSectionChapter(payload, chapter.chapterId, sectionTitle)
  activeChapterTitle = chapterTitle
  activeSectionTitle = sectionTitle
  activeSectionChapterId = section.chapterId

  switched = false
  if (switchSectionTitle && normalizeTitle(switchSectionTitle) !== normalizeTitle(activeSectionTitle)) {
    const switchedSection = ensureSectionChapter(payload, chapter.chapterId, switchSectionTitle)
    activeSectionTitle = normalizeTitle(switchSectionTitle)
    activeSectionChapterId = switchedSection.chapterId
    switched = true
  }

  normalizedQuestions = rewriteQuestionTitlesByResolvedChapter(payload, normalizedQuestions)

  const effectiveHasExtractableQuestions =
    boundaryDetect.question.hasExtractableQuestions && !rangeMismatchBlocked

  if (effectiveHasExtractableQuestions) {
    upsertQuestionsById(payload, normalizedQuestions)
    await appendPendingReviewLogs(sessionId, pendingReviewLogs)
  }

  if (!effectiveHasExtractableQuestions) {
    pendingPageDataUrls = [...questionImageDataUrls]
    pendingPageLabels = [...questionImageLabels]
    if (pendingPageDataUrls.length > MAX_PENDING_QUEUE_PAGES) {
      pendingPageDataUrls = pendingPageDataUrls.slice(-MAX_PENDING_QUEUE_PAGES)
      pendingPageLabels = pendingPageLabels.slice(-MAX_PENDING_QUEUE_PAGES)
    }
    pendingContinueQuestionKey = effectiveBoundaryContinueKey || null
    questionSession.processingStartQuestionKey = processingStartQuestionKey
    questionSession.pendingReason = boundaryDetect.question.reason
    questionSession.pendingUpsertedCount = 0
  } else if (effectiveBoundaryContinueKey) {
    pendingPageDataUrls = [imageDataUrl]
    pendingPageLabels = [imageLabel || 'current']
    pendingContinueQuestionKey = effectiveBoundaryContinueKey
    questionSession.processingStartQuestionKey = effectiveBoundaryContinueKey
    questionSession.pendingReason = boundaryDetect.question.reason
    questionSession.pendingUpsertedCount = normalizedQuestions.length
  } else {
    pendingPageDataUrls = []
    pendingPageLabels = []
    pendingContinueQuestionKey = null
    questionSession.processingStartQuestionKey = null
    questionSession.pendingReason = null
    questionSession.pendingUpsertedCount = 0
  }

  passLogs.push({
    pass: 1,
    chapterTitle: activeChapterTitle,
    sectionTitle,
    switchSectionTitle: switchSectionTitle ?? null,
    switched,
    needReprocessSameImage: false,
    reason: chapterDetect.reason,
    question: {
      mode,
      pending: finalQuestionDetect.needNextPage,
      reason: finalQuestionDetect.reason,
      processingStartQuestionKey,
      nextStartQuestionKey: finalQuestionDetect.needNextPage
        ? pendingContinueQuestionKey || processingStartQuestionKey || null
        : null,
      continueQuestionKey: finalQuestionDetect.continueQuestionKey,
      upsertedCount: normalizedQuestions.length,
      pendingReviewCount: pendingReviewLogs.length,
      droppedPendingQuestionCount: pendingFiltered.droppedCount,
      pendingPageLabels,
      boundaryHasExtractableQuestions: boundaryDetect.question.hasExtractableQuestions,
      boundaryNeedNextPage: boundaryDetect.question.needNextPage,
      boundaryQueueTailQuestionKey,
      boundaryContinueQuestionKey: boundaryContinueKey || null,
      lookaheadQueueTailQuestionKey,
      lookaheadAdjustedContinueQuestionKey,
      boundaryLookaheadLabel: lookaheadImageLabel || null,
      boundaryLookaheadReason,
      pendingReviewFixRetried,
      integrityFixRetried,
      rangeFixRetried,
      rangeMismatchBlocked,
      boundaryReason: boundaryDetect.question.reason,
      boundaryRetryReason,
      extractReason,
      retryExtractReason,
      integrityRetryReason,
      rangeRetryReason,
      extractReturnedCount,
      normalizedCount,
      sessionStoredProcessingStartQuestionKey,
      sessionStoredPendingContinueQuestionKey,
      effectiveProcessingStartQuestionKey: processingStartQuestionKey,
      effectiveExtractEndBeforeQuestionKey: effectiveBoundaryContinueKey,
      effectiveExtractMode: mode,
      retried,
    },
  })

  const activeTopChapter = ensureTopChapter(payload, activeChapterTitle)
  const activeSection = ensureSectionChapter(payload, activeTopChapter.chapterId, activeSectionTitle)
  questionSession.currentChapterTitle = activeChapterTitle
  questionSession.currentSectionTitle = activeSectionTitle
  questionSession.currentSectionChapterId = activeSection.chapterId
  questionSession.pendingPageDataUrls = pendingPageDataUrls
  questionSession.pendingPageLabels = pendingPageLabels
  questionSession.pendingContinueQuestionKey = pendingContinueQuestionKey

  const questionResult: Record<string, unknown> = finalQuestionDetect.needNextPage
    ? {
        pending: true,
        reason: finalQuestionDetect.reason,
        processingStartQuestionKey,
        nextStartQuestionKey: pendingContinueQuestionKey || processingStartQuestionKey || null,
        continueQuestionKey: pendingContinueQuestionKey,
        pendingPagesCount: pendingPageDataUrls.length,
        pendingPageLabels,
        upsertedCount: normalizedQuestions.length,
        upsertedQuestionTitles: normalizedQuestions.map((item) => item.title || item.questionId),
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: pendingFiltered.droppedCount,
        boundaryHasExtractableQuestions: boundaryDetect.question.hasExtractableQuestions,
        boundaryNeedNextPage: boundaryDetect.question.needNextPage,
        boundaryQueueTailQuestionKey,
        boundaryContinueQuestionKey: boundaryContinueKey || null,
        lookaheadQueueTailQuestionKey,
        lookaheadAdjustedContinueQuestionKey,
        boundaryLookaheadLabel: lookaheadImageLabel || null,
        boundaryLookaheadReason,
        boundaryReason: boundaryDetect.question.reason,
        boundaryRetryReason,
        extractReason,
        retryExtractReason,
        integrityRetryReason,
        rangeRetryReason,
        extractReturnedCount,
        normalizedCount,
        sessionStoredProcessingStartQuestionKey,
        sessionStoredPendingContinueQuestionKey,
        effectiveProcessingStartQuestionKey: processingStartQuestionKey,
        effectiveExtractEndBeforeQuestionKey: effectiveBoundaryContinueKey,
        effectiveExtractMode: mode,
        integrityFixRetried,
        pendingReviewFixRetried,
        rangeFixRetried,
        rangeMismatchBlocked,
        rawText: finalQuestionDetect.rawText,
        retried,
      }
      : {
        pending: false,
        reason: finalQuestionDetect.reason,
        processingStartQuestionKey,
        nextStartQuestionKey: null,
        pendingPagesCount: 0,
        pendingPageLabels: [],
        upsertedCount: normalizedQuestions.length,
        upsertedQuestionTitles: normalizedQuestions.map((item) => item.title || item.questionId),
        pendingReviewCount: pendingReviewLogs.length,
        droppedPendingQuestionCount: pendingFiltered.droppedCount,
        boundaryHasExtractableQuestions: boundaryDetect.question.hasExtractableQuestions,
        boundaryNeedNextPage: boundaryDetect.question.needNextPage,
        boundaryQueueTailQuestionKey,
        boundaryContinueQuestionKey: boundaryContinueKey || null,
        lookaheadQueueTailQuestionKey,
        lookaheadAdjustedContinueQuestionKey,
        boundaryLookaheadLabel: lookaheadImageLabel || null,
        boundaryLookaheadReason,
        boundaryReason: boundaryDetect.question.reason,
        boundaryRetryReason,
        extractReason,
        retryExtractReason,
        integrityRetryReason,
        rangeRetryReason,
        extractReturnedCount,
        normalizedCount,
        sessionStoredProcessingStartQuestionKey,
        sessionStoredPendingContinueQuestionKey,
        effectiveProcessingStartQuestionKey: processingStartQuestionKey,
        effectiveExtractEndBeforeQuestionKey: effectiveBoundaryContinueKey,
        effectiveExtractMode: mode,
        integrityFixRetried,
        pendingReviewFixRetried,
        rangeFixRetried,
        rangeMismatchBlocked,
        questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
        rawText: finalQuestionDetect.rawText,
        retried,
      }

  await saveTextbookJson(session.jsonFilePath, payload)
  session.currentChapterTitle = activeChapterTitle
  session.currentSectionTitle = activeSectionTitle
  session.updatedAt = new Date().toISOString()
  await setChapterSession(sessionId, session)
  questionSession.updatedAt = new Date().toISOString()
  await setQuestionSession(sessionId, questionSession)

  return {
    message: 'success',
    sessionId,
    jsonFilePath: session.jsonFilePath,
    currentChapterTitle: session.currentChapterTitle,
    currentSectionTitle: session.currentSectionTitle,
    currentSectionChapterId: activeSection.chapterId,
    chaptersCount: payload.chapters.length,
    questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
    passLogs,
    question: questionResult,
  }
}
ensureDir(UPLOAD_DIR)
ensureDir(OUTPUT_DIR)
ensureDir(OUTPUT_JSON_DIR)
ensureDir(MERGED_JSON_DIR)
ensureDir(READ_RESULTS_DIR)

export {
  appendAutoProcessFailureLog,
  appendChapterSegmentFromImages,
  appendPendingReviewLogs,
  batchId,
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
  buildCanonicalQuestionTitle,
  buildQuestionDisplayTitle,
  detectQuestionEmptyAnswerIssue,
  detectQuestionIntegrityIssue,
  ensureSectionChapter,
  ensureTopChapter,
  ensureDir,
  extractArkText,
  extractFirstJsonObject,
  extractQuestionNoFromId,
  extractQuestionNoFromText,
  getPayloadAnswerHandlingMode,
  getPayloadDocumentType,
  getPayloadSourceMeta,
  isSupportedImageFileName,
  isValidTextbookPayload,
  loadTextbookJson,
  QUESTION_TYPE_OPTIONS,
  normalizeJsonFileName,
  normalizeJsonPath,
  normalizeQuestionItem,
  normalizeQuestionType,
  normalizeTitle,
  parsePageIndex,
  parseModelJsonObject,
  payloadExpectsAnswer,
  processChapterSessionImage,
  readByDoubao,
  regenerateModelJsonWithImagesByDoubao,
  repairModelJsonByDoubao,
  requestArkRawWithRetry,
  rewriteQuestionTitlesByResolvedChapter,
  sanitizeFileName,
  sanitizeFolderName,
  saveTextbookJson,
  sortImageFileNames,
  toImageDataUrl,
  toImageDataUrlFromFile,
  upsertQuestionsById,
  writeNdjson,
}

