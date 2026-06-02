import fsp from 'node:fs/promises'
import path from 'node:path'
import { READ_RESULTS_DIR } from '../../config'
import type { QuestionItem } from '../../types'

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

export { appendAutoProcessFailureLog, appendPendingReviewLogs, collectPendingReviewLogs }
