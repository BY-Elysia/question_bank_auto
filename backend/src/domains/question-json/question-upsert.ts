import type { QuestionItem, TextbookJsonPayload } from '../../types'

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

export { upsertQuestionsById }
