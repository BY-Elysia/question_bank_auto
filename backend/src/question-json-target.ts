import type { TextbookJsonPayload } from './types'

type JsonNode = Record<string, unknown>

export function isObject(value: unknown): value is JsonNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function findChapterById(payload: TextbookJsonPayload, chapterId: string) {
  return payload.chapters.find((item) => item.chapterId === chapterId) || null
}

export function findQuestionNode(payload: TextbookJsonPayload, questionId: string) {
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  return (
    questions.find((item) => isObject(item) && typeof item.questionId === 'string' && item.questionId.trim() === questionId) ||
    null
  ) as JsonNode | null
}

function normalizeQuestionTitleForMatch(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function findQuestionNodeByTitle(payload: TextbookJsonPayload, questionTitle: string) {
  const normalizedTitle = normalizeQuestionTitleForMatch(questionTitle)
  if (!normalizedTitle) {
    return null
  }

  const compactTitle = normalizedTitle.replace(/\s+/g, '')
  const questions = Array.isArray(payload.questions) ? payload.questions.filter(isObject) : []
  const matches = questions.filter((item) => {
    const itemTitle = normalizeQuestionTitleForMatch(item.title)
    return itemTitle === normalizedTitle || itemTitle.replace(/\s+/g, '') === compactTitle
  })

  if (matches.length > 1) {
    const ids = matches
      .map((item) => (typeof item.questionId === 'string' ? item.questionId.trim() : ''))
      .filter(Boolean)
      .join(', ')
    throw new Error(`questionTitle "${normalizedTitle}" matched multiple questions${ids ? `: ${ids}` : ''}`)
  }

  return (matches[0] || null) as JsonNode | null
}

export function findChildNode(
  questionNode: JsonNode,
  params: {
    childNo?: number | null
    childQuestionId?: string
  },
) {
  const { childNo = null, childQuestionId = '' } = params
  const children = Array.isArray(questionNode.children) ? questionNode.children.filter(isObject) : []
  if (!children.length) {
    return null
  }

  const normalizedChildQuestionId = String(childQuestionId || '').trim()
  if (normalizedChildQuestionId) {
    const byFullId = children.find(
      (child) => typeof child.questionId === 'string' && child.questionId.trim() === normalizedChildQuestionId,
    )
    if (byFullId) {
      return byFullId
    }
  }

  if (Number.isInteger(childNo) && Number(childNo) > 0) {
    const byOrder = children.find((child) => Number(child.orderNo) === Number(childNo))
    if (byOrder) {
      return byOrder
    }

    const suffix = `_${childNo}`
    const bySuffix = children.find(
      (child) => typeof child.questionId === 'string' && child.questionId.trim().endsWith(suffix),
    )
    if (bySuffix) {
      return bySuffix
    }

    return children[Number(childNo) - 1] || null
  }

  return null
}

export function buildLegacyQuestionId(chapterNo: number, sectionNo: number, questionNo: number) {
  return `q_${chapterNo}_${sectionNo}_${questionNo}`
}

export function parseQuestionIdParts(questionId: string) {
  const match = String(questionId || '').trim().match(/^q_(\d+)_(\d+)_(\d+)(?:_(\d+))?$/)
  if (!match) {
    return null
  }
  return {
    chapterNo: Number(match[1]),
    sectionNo: Number(match[2]),
    questionNo: Number(match[3]),
    childNo: match[4] ? Number(match[4]) : null,
  }
}

export function resolveChapterTitles(payload: TextbookJsonPayload, chapterId: string) {
  const current = findChapterById(payload, chapterId)
  if (!current) {
    return {
      chapterTitle: '',
      sectionTitle: '',
    }
  }

  if (!current.parentId) {
    return {
      chapterTitle: current.title,
      sectionTitle: current.title,
    }
  }

  const parent = findChapterById(payload, current.parentId)
  return {
    chapterTitle: parent?.title || current.title,
    sectionTitle: current.title,
  }
}

export function resolveQuestionTarget(params: {
  payload: TextbookJsonPayload
  questionId?: string
  questionTitle?: string
  childQuestionId?: string
  childNo?: number | null
}) {
  const {
    payload,
    questionId = '',
    questionTitle = '',
    childQuestionId = '',
    childNo = null,
  } = params

  let normalizedQuestionId = String(questionId || '').trim()
  const normalizedQuestionTitle = normalizeQuestionTitleForMatch(questionTitle)
  if (!normalizedQuestionId && !normalizedQuestionTitle) {
    throw new Error('questionId or questionTitle is required')
  }

  let questionNode = normalizedQuestionId ? findQuestionNode(payload, normalizedQuestionId) : null
  if (!questionNode && normalizedQuestionTitle) {
    questionNode = findQuestionNodeByTitle(payload, normalizedQuestionTitle)
    normalizedQuestionId =
      questionNode && typeof questionNode.questionId === 'string' && questionNode.questionId.trim()
        ? questionNode.questionId.trim()
        : normalizedQuestionId
  }
  if (!questionNode) {
    if (normalizedQuestionId) {
      throw new Error(`questionId ${normalizedQuestionId} not found in JSON`)
    }
    throw new Error(`questionTitle "${normalizedQuestionTitle}" not found in JSON`)
  }
  if (!normalizedQuestionId) {
    normalizedQuestionId =
      typeof questionNode.questionId === 'string' && questionNode.questionId.trim()
        ? questionNode.questionId.trim()
        : ''
  }
  if (!normalizedQuestionId) {
    throw new Error(`questionTitle "${normalizedQuestionTitle}" has no questionId`)
  }

  const chapterId =
    typeof questionNode.chapterId === 'string' && questionNode.chapterId.trim()
      ? questionNode.chapterId.trim()
      : ''
  if (!chapterId) {
    throw new Error(`questionId ${normalizedQuestionId} has no chapterId`)
  }

  const titles = resolveChapterTitles(payload, chapterId)
  const resolvedQuestionTitle =
    typeof questionNode.title === 'string' && questionNode.title.trim()
      ? questionNode.title.trim()
      : normalizedQuestionId

  const childNode = findChildNode(questionNode, {
    childNo,
    childQuestionId,
  })
  const normalizedChildQuestionId =
    childNode && typeof childNode.questionId === 'string' ? childNode.questionId.trim() : ''

  if (String(childQuestionId || '').trim() && !normalizedChildQuestionId) {
    throw new Error(`childQuestionId ${String(childQuestionId || '').trim()} not found under questionId ${normalizedQuestionId}`)
  }
  if (Number.isInteger(childNo) && Number(childNo) > 0 && !normalizedChildQuestionId) {
    throw new Error(`childNo ${childNo} not found under questionId ${normalizedQuestionId}`)
  }

  return {
    questionNode,
    childNode,
    questionId: normalizedQuestionId,
    childQuestionId: normalizedChildQuestionId,
    chapterId,
    chapterTitle: titles.chapterTitle,
    sectionTitle: titles.sectionTitle,
    questionTitle: resolvedQuestionTitle,
  }
}
