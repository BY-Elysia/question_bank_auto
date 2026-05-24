import { normalizeTitle } from './chapter-tree'
import { resolveAnswerHandlingMode } from './payload'
import { normalizeQuestionType } from './question-types'
import type {
  AnswerHandlingMode,
  QuestionGroupChild,
  QuestionItem,
  QuestionOption,
  QuestionRubricItem,
  QuestionTextBlock,
  TextbookJsonPayload,
} from '../../types'

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

function questionDisplayKey(item: QuestionItem) {
  if (item.title) return item.title
  const questionNo = extractQuestionNoFromId(item.questionId) || extractQuestionNoFromText(item.title)
  return questionNo ? `第${questionNo}题` : item.title || item.questionId
}

function stripLeadingQuestionLabel(title: string) {
  return String(title || '')
    .replace(/^\s*第\s*\d+\s*题[\s.:：、-]*/u, '')
    .replace(/^\s*\d+\s*[.、．。:：-]\s*/u, '')
    .trim()
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

export {
  buildCanonicalQuestionTitle,
  buildQuestionDisplayTitle,
  detectQuestionEmptyAnswerIssue,
  detectQuestionIntegrityIssue,
  extractQuestionNoFromId,
  extractQuestionNoFromPrompt,
  extractQuestionNoFromText,
  isLikelyIncompleteForQueue,
  normalizeDigits,
  normalizePersistedChoiceQuestionShapes,
  normalizeQuestionItem,
  rewriteQuestionTitlesByResolvedChapter,
}
