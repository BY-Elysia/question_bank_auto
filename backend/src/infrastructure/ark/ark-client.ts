import {
  ARK_API_KEY,
  ARK_BASE_URL,
  ARK_RETRY_DELAY_MS,
  ARK_RETRY_TIMES,
  ARK_TIMEOUT_MS,
} from '../../config'
import { getArkApiKeyOverride } from '../../ark-request-context'

export function extractArkText(payload: unknown) {
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

export function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const name = String((error as { name?: unknown }).name || '')
  const message = String((error as { message?: unknown }).message || '')
  return name === 'AbortError' || message.toLowerCase().includes('aborted')
}

export function isTransientNetworkError(error: unknown) {
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

export async function sleep(ms: number) {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function getEffectiveArkApiKey() {
  return getArkApiKeyOverride() || ARK_API_KEY
}

export async function requestArkRawWithRetry(body: Record<string, unknown>) {
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
