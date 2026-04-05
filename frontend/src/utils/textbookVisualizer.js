function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function parseNumericTokens(value, prefix = '') {
  const source = String(value || '').trim()
  const body = prefix && source.startsWith(prefix) ? source.slice(prefix.length) : source
  return body
    .split('_')
    .map((token) => Number(token))
    .filter((token) => Number.isFinite(token))
}

function compareNumericTokenLists(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? -1
    const b = right[index] ?? -1
    if (a !== b) {
      return a - b
    }
  }
  return 0
}

function compareChapter(left, right) {
  const orderCompare = toFiniteNumber(left.orderNo) - toFiniteNumber(right.orderNo)
  if (orderCompare !== 0) {
    return orderCompare
  }

  const idCompare = compareNumericTokenLists(
    parseNumericTokens(left.chapterId, 'ch_'),
    parseNumericTokens(right.chapterId, 'ch_'),
  )
  if (idCompare !== 0) {
    return idCompare
  }

  return String(left.title || '').localeCompare(String(right.title || ''), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  })
}

function extractQuestionSortTokens(question) {
  const questionId = String(question?.questionId || '').trim()
  if (questionId) {
    return parseNumericTokens(questionId, 'q_')
  }
  return [...String(question?.title || '').matchAll(/(\d+)/g)].map((match) => Number(match[1]))
}

function compareQuestion(left, right) {
  const chapterCompare = compareNumericTokenLists(
    parseNumericTokens(left.chapterId, 'ch_'),
    parseNumericTokens(right.chapterId, 'ch_'),
  )
  if (chapterCompare !== 0) {
    return chapterCompare
  }

  const questionCompare = compareNumericTokenLists(
    extractQuestionSortTokens(left),
    extractQuestionSortTokens(right),
  )
  if (questionCompare !== 0) {
    return questionCompare
  }

  return String(left.questionId || '').localeCompare(String(right.questionId || ''), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  })
}

export function normalizeTextBlock(value) {
  if (!value) {
    return { text: '', media: [] }
  }
  if (typeof value === 'string') {
    return { text: value, media: [] }
  }
  return {
    text: String(value.text || ''),
    media: Array.isArray(value.media) ? value.media : [],
  }
}

function normalizeQuestionType(value) {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }
  const upper = raw.toUpperCase()
  if (upper === 'PROGRAMMING' || upper === 'CODE') {
    return 'CODE'
  }
  return upper
}

function normalizeQuestion(question) {
  const source = question && typeof question === 'object' ? question : {}
  const nodeType = String(source.nodeType || 'LEAF').toUpperCase()
  if (nodeType === 'GROUP') {
    const children = Array.isArray(source.children) ? source.children : []
    return {
      questionId: String(source.questionId || ''),
      chapterId: String(source.chapterId || ''),
      nodeType: 'GROUP',
      questionType: normalizeQuestionType(source.questionType),
      title: String(source.title || ''),
      stem: normalizeTextBlock(source.stem),
      children: [...children]
        .map((child) => ({
          questionId: String(child?.questionId || ''),
          chapterId: String(child?.chapterId || source.chapterId || ''),
          title: String(child?.title || ''),
          orderNo: toFiniteNumber(child?.orderNo),
          questionType: normalizeQuestionType(child?.questionType),
          prompt: normalizeTextBlock(child?.prompt),
          standardAnswer: normalizeTextBlock(child?.standardAnswer),
          defaultScore: toFiniteNumber(child?.defaultScore),
        }))
        .sort((left, right) => {
          const orderCompare = left.orderNo - right.orderNo
          if (orderCompare !== 0) {
            return orderCompare
          }
          return compareQuestion(left, right)
        }),
    }
  }

  return {
    questionId: String(source.questionId || ''),
    chapterId: String(source.chapterId || ''),
    nodeType: 'LEAF',
    questionType: normalizeQuestionType(source.questionType),
    title: String(source.title || ''),
    prompt: normalizeTextBlock(source.prompt),
    standardAnswer: normalizeTextBlock(source.standardAnswer),
    defaultScore: toFiniteNumber(source.defaultScore),
  }
}

export function buildTextbookVisualizerModel(payload) {
  const documentType =
    String(payload?.documentType || '').trim().toLowerCase() === 'exam' || payload?.exam ? 'exam' : 'textbook'
  const textbook = payload?.textbook && typeof payload.textbook === 'object' ? payload.textbook : {}
  const exam = payload?.exam && typeof payload.exam === 'object' ? payload.exam : {}
  const chapterRows = Array.isArray(payload?.chapters) ? payload.chapters : []
  const questionRows = Array.isArray(payload?.questions) ? payload.questions : []
  const questionBuckets = new Map()

  const normalizedQuestions = [...questionRows].map(normalizeQuestion).sort(compareQuestion)
  for (const question of normalizedQuestions) {
    const key = String(question.chapterId || '').trim() || '__unmatched__'
    const bucket = questionBuckets.get(key) || []
    bucket.push(question)
    questionBuckets.set(key, bucket)
  }

  const chapterMap = new Map(
    chapterRows.map((row) => {
      const chapterId = String(row?.chapterId || '').trim()
      return [
        chapterId,
        {
          chapterId,
          parentId: row?.parentId ? String(row.parentId) : null,
          title: String(row?.title || chapterId || '未命名章节'),
          orderNo: toFiniteNumber(row?.orderNo),
          depth: 0,
          synthetic: false,
          directQuestions: questionBuckets.get(chapterId) || [],
          totalQuestions: 0,
          children: [],
        },
      ]
    }),
  )

  for (const chapterId of questionBuckets.keys()) {
    if (chapterId === '__unmatched__' || chapterMap.has(chapterId)) {
      continue
    }
    chapterMap.set(chapterId, {
      chapterId,
      parentId: null,
      title: `未匹配章节 ${chapterId}`,
      orderNo: 999999,
      depth: 0,
      synthetic: true,
      directQuestions: questionBuckets.get(chapterId) || [],
      totalQuestions: 0,
      children: [],
    })
  }

  const roots = []
  for (const node of chapterMap.values()) {
    const parent = node.parentId ? chapterMap.get(node.parentId) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNode = (node, depth = 0) => {
    node.depth = depth
    node.children.sort(compareChapter)
    let totalQuestions = node.directQuestions.length
    for (const child of node.children) {
      totalQuestions += sortNode(child, depth + 1)
    }
    node.totalQuestions = totalQuestions
    return totalQuestions
  }

  roots.sort(compareChapter)
  for (const root of roots) {
    sortNode(root, 0)
  }

  const flatChapters = []
  const walk = (node) => {
    flatChapters.push(node)
    for (const child of node.children) {
      walk(child)
    }
  }
  for (const root of roots) {
    walk(root)
  }

  return {
    version: String(payload?.version || ''),
    courseId: String(payload?.courseId || ''),
    documentType,
    source: {
      externalId:
        documentType === 'exam' ? String(exam.examId || '') : String(textbook.textbookId || ''),
      title: documentType === 'exam' ? String(exam.title || '') : String(textbook.title || ''),
      subject: documentType === 'exam' ? String(exam.subject || '') : String(textbook.subject || ''),
      publisher: documentType === 'exam' ? '' : String(textbook.publisher || ''),
      examType: documentType === 'exam' ? String(exam.examType || '') : '',
      hasAnswer: documentType === 'exam' ? exam.hasAnswer !== false : textbook.hasAnswer !== false,
    },
    textbook: {
      textbookId: String(textbook.textbookId || ''),
      title: String(textbook.title || ''),
      publisher: String(textbook.publisher || ''),
      subject: String(textbook.subject || ''),
      hasAnswer: textbook.hasAnswer !== false,
    },
    exam: {
      examId: String(exam.examId || ''),
      title: String(exam.title || ''),
      subject: String(exam.subject || ''),
      examType: String(exam.examType || ''),
      hasAnswer: exam.hasAnswer !== false,
    },
    roots,
    flatChapters,
    chapterMap,
    totalChapters: flatChapters.length,
    totalQuestions: normalizedQuestions.length,
  }
}

export function collectQuestionGroups(chapterNode) {
  if (!chapterNode) {
    return []
  }

  const groups = []
  const walk = (node) => {
    if (node.directQuestions.length) {
      groups.push({
        chapterId: node.chapterId,
        title: node.title,
        depth: node.depth,
        questions: node.directQuestions,
      })
    }
    for (const child of node.children) {
      walk(child)
    }
  }

  walk(chapterNode)
  return groups
}
