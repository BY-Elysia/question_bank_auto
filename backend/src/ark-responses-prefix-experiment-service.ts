import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  APP_ROOT,
  ARK_API_KEY,
  ARK_BASE_URL,
  ARK_MODEL,
  ARK_RETRY_DELAY_MS,
  ARK_RETRY_TIMES,
  ARK_TIMEOUT_MS,
} from './config'
import { getArkApiKeyOverride } from './ark-request-context'

type ResponsesTextPart = {
  type: 'input_text'
  text: string
}

type ResponsesImagePart = {
  type: 'input_image'
  image_url: string
}

export type ArkResponsesExperimentMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<ResponsesTextPart | ResponsesImagePart>
}

type PrefixSeedEntry = {
  key: string
  promptHash: string
  model: string
  responseId: string
  createdAt: string
  updatedAt: string
}

type PrefixSeedStore = Record<string, PrefixSeedEntry>

export type ArkResponsesPrefixUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
}

export type ArkResponsesPrefixResult = {
  text: string
  raw: string
  parsed: unknown
  responseId: string
  seedResponseId: string
  seedSource: 'fixed' | 'local-cache' | 'remote-create' | 'remote-refresh'
  usage: ArkResponsesPrefixUsage
}

const ARK_RESPONSES_TARGET = String(
  process.env.ARK_RESPONSES_MODEL || ARK_MODEL,
).trim()
const RESPONSES_URL = String(process.env.ARK_RESPONSES_URL || `${ARK_BASE_URL}/responses`).trim()
const RESPONSES_PREFIX_EXPIRE_SECONDS = Number(process.env.ARK_RESPONSES_PREFIX_EXPIRE_SECONDS || 0)
const RESPONSES_STATE_DIR = path.resolve(
  String(process.env.ARK_RESPONSES_PREFIX_STATE_DIR || path.join(APP_ROOT, 'runtime_cache')),
)
const RESPONSES_STATE_FILE = path.join(RESPONSES_STATE_DIR, 'ark_responses_prefix_experiment.json')

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message || ''))
}

function isTransientNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = String(error.message || '').toLowerCase()
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

class ArkResponsesHttpError extends Error {
  status: number
  raw: string

  constructor(status: number, raw: string) {
    super(`Ark responses request failed: ${status} ${raw}`)
    this.name = 'ArkResponsesHttpError'
    this.status = status
    this.raw = raw
  }
}

function buildPromptHash(messages: ArkResponsesExperimentMessage[]) {
  return crypto.createHash('sha256').update(JSON.stringify(messages)).digest('hex')
}

async function loadSeedStore() {
  const text = await fsp.readFile(RESPONSES_STATE_FILE, 'utf8').catch(() => '')
  if (!text.trim()) {
    return {} as PrefixSeedStore
  }
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {} as PrefixSeedStore
    }
    return parsed as PrefixSeedStore
  } catch {
    return {} as PrefixSeedStore
  }
}

async function saveSeedStore(store: PrefixSeedStore) {
  await fsp.mkdir(RESPONSES_STATE_DIR, { recursive: true })
  await fsp.writeFile(RESPONSES_STATE_FILE, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8' })
}

async function upsertSeedEntry(entry: PrefixSeedEntry) {
  const store = await loadSeedStore()
  store[entry.key] = entry
  await saveSeedStore(store)
}

async function removeSeedEntry(key: string) {
  const store = await loadSeedStore()
  if (!store[key]) {
    return
  }
  delete store[key]
  await saveSeedStore(store)
}

function getEffectiveArkApiKey() {
  return getArkApiKeyOverride() || ARK_API_KEY
}

async function requestArkResponsesRawWithRetry(body: Record<string, unknown>) {
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
      const resp = await fetch(RESPONSES_URL, {
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
        throw new ArkResponsesHttpError(resp.status, raw)
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
          `Ark responses request failed after retries (timeout/network). timeout=${ARK_TIMEOUT_MS}ms attempts=${totalAttempts}.`,
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  if (isAbortError(lastError)) {
    throw new Error(
      `Ark responses request timeout after ${ARK_TIMEOUT_MS}ms (attempts: ${Math.max(1, ARK_RETRY_TIMES + 1)}).`,
    )
  }
  if (isTransientNetworkError(lastError)) {
    throw new Error(
      `Ark responses request network failure after retries (attempts: ${Math.max(1, ARK_RETRY_TIMES + 1)}).`,
    )
  }
  throw (lastError instanceof Error ? lastError : new Error(String(lastError || 'Unknown Ark responses error')))
}

function extractResponseId(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  if (typeof record.id === 'string' && record.id.trim()) {
    return record.id.trim()
  }
  const data = record.data
  if (data && typeof data === 'object') {
    const asRecord = data as Record<string, unknown>
    if (typeof asRecord.id === 'string' && asRecord.id.trim()) {
      return asRecord.id.trim()
    }
  }
  return ''
}

function extractResponsesText(payload: unknown) {
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

function extractUsage(payload: unknown): ArkResponsesPrefixUsage {
  if (!payload || typeof payload !== 'object') {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
    }
  }
  const usage = (payload as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object') {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
    }
  }
  const usageRecord = usage as Record<string, unknown>
  const inputDetails =
    usageRecord.input_tokens_details && typeof usageRecord.input_tokens_details === 'object'
      ? (usageRecord.input_tokens_details as Record<string, unknown>)
      : {}
  return {
    promptTokens: Number(usageRecord.input_tokens ?? 0),
    completionTokens: Number(usageRecord.output_tokens ?? 0),
    totalTokens: Number(usageRecord.total_tokens ?? 0),
    cachedTokens: Number(inputDetails.cached_tokens ?? 0),
  }
}

function buildResponsesInput(messages: ArkResponsesExperimentMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

function buildSeedInput(messages: ArkResponsesExperimentMessage[]) {
  const mergedText = messages
    .map((message) => {
      if (typeof message.content === 'string') {
        return message.content
      }
      return message.content
        .map((part) => (part.type === 'input_text' ? part.text : ''))
        .filter(Boolean)
        .join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()

  return [
    {
      role: 'system',
      content: mergedText,
    },
  ] satisfies Array<{ role: 'system'; content: string }>
}

function isLikelyInvalidPreviousResponse(error: unknown) {
  if (!(error instanceof ArkResponsesHttpError)) {
    return false
  }
  const raw = String(error.raw || '').toLowerCase()
  return (
    (error.status === 400 || error.status === 404) &&
    (raw.includes('previous_response_id') ||
      (raw.includes('response') && raw.includes('not found')) ||
      raw.includes('does not exist') ||
      raw.includes('expired'))
  )
}

function buildExpireAt() {
  if (!(RESPONSES_PREFIX_EXPIRE_SECONDS > 0)) {
    return null
  }
  return Math.floor(Date.now() / 1000) + RESPONSES_PREFIX_EXPIRE_SECONDS
}

export async function ensureResponsesPrefixSeed(params: {
  key: string
  sharedInput: ArkResponsesExperimentMessage[]
  fixedResponseId?: string
  model?: string
}) {
  const {
    key,
    sharedInput,
    fixedResponseId = '',
    model = ARK_RESPONSES_TARGET,
  } = params

  if (!getEffectiveArkApiKey()) {
    throw new Error('ARK_API_KEY is missing')
  }

  const fixed = String(fixedResponseId || '').trim()
  if (fixed) {
    return {
      responseId: fixed,
      source: 'fixed' as const,
    }
  }

  const promptHash = buildPromptHash(sharedInput)
  const store = await loadSeedStore()
  const existing = store[key]
  if (existing && existing.promptHash === promptHash && existing.model === model && existing.responseId) {
    return {
      responseId: existing.responseId,
      source: 'local-cache' as const,
    }
  }

  const body: Record<string, unknown> = {
    model,
    input: buildSeedInput(sharedInput),
    store: true,
    caching: {
      type: 'enabled',
      prefix: true,
    },
    thinking: {
      type: 'disabled',
    },
  }
  const expireAt = buildExpireAt()
  if (expireAt) {
    body.expire_at = expireAt
  }

  const raw = await requestArkResponsesRawWithRetry(body)
  const parsed = JSON.parse(raw) as unknown
  const responseId = extractResponseId(parsed)
  if (!responseId) {
    throw new Error(`Ark responses seed response has no id: ${raw.slice(0, 500)}`)
  }

  const now = new Date().toISOString()
  await upsertSeedEntry({
    key,
    promptHash,
    model,
    responseId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  })

  return {
    responseId,
    source: 'remote-create' as const,
  }
}

export async function requestArkResponsesPrefixCompletion(params: {
  key: string
  sharedInput: ArkResponsesExperimentMessage[]
  requestInput: ArkResponsesExperimentMessage[]
  fixedResponseId?: string
  model?: string
  temperature?: number
}) {
  const {
    key,
    sharedInput,
    requestInput,
    fixedResponseId = '',
    model = ARK_RESPONSES_TARGET,
    temperature = 0,
  } = params

  const fixed = String(fixedResponseId || '').trim()
  const ensured = await ensureResponsesPrefixSeed({
    key,
    sharedInput,
    fixedResponseId: fixed,
    model,
  })
  let seedResponseId = ensured.responseId
  let seedSource: ArkResponsesPrefixResult['seedSource'] = ensured.source

  const buildBody = (nextSeedResponseId: string) => {
    const body: Record<string, unknown> = {
      model,
      previous_response_id: nextSeedResponseId,
      input: buildResponsesInput(requestInput),
      caching: {
        type: 'enabled',
      },
      thinking: {
        type: 'disabled',
      },
      temperature,
    }
    return body
  }

  try {
    const raw = await requestArkResponsesRawWithRetry(buildBody(seedResponseId))
    const parsed = JSON.parse(raw) as unknown
    const text = extractResponsesText(parsed)
    if (!text) {
      throw new Error(`Ark responses request has no text output: ${raw.slice(0, 500)}`)
    }
    return {
      text,
      raw,
      parsed,
      responseId: extractResponseId(parsed),
      seedResponseId,
      seedSource,
      usage: extractUsage(parsed),
    } satisfies ArkResponsesPrefixResult
  } catch (error) {
    if (fixed || !isLikelyInvalidPreviousResponse(error)) {
      throw error
    }

    await removeSeedEntry(key)
    const refreshed = await ensureResponsesPrefixSeed({
      key,
      sharedInput,
      model,
    })
    seedResponseId = refreshed.responseId
    seedSource = 'remote-refresh'

    const raw = await requestArkResponsesRawWithRetry(buildBody(seedResponseId))
    const parsed = JSON.parse(raw) as unknown
    const text = extractResponsesText(parsed)
    if (!text) {
      throw new Error(`Ark responses request has no text output after refresh: ${raw.slice(0, 500)}`)
    }
    return {
      text,
      raw,
      parsed,
      responseId: extractResponseId(parsed),
      seedResponseId,
      seedSource,
      usage: extractUsage(parsed),
    } satisfies ArkResponsesPrefixResult
  }
}
