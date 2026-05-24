import fsp from 'node:fs/promises'
import { isValidTextbookPayload } from './payload'
import { normalizePersistedChoiceQuestionShapes } from './question-normalize'
import type { TextbookJsonPayload } from '../../types'

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

export { loadTextbookJson, saveTextbookJson }
