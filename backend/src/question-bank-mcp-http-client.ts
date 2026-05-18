import { PORT } from './config'

type JsonRpcEnvelope = {
  error?: {
    message?: unknown
  }
  result?: Record<string, unknown>
}

async function requestQuestionBankMcp(method: string, params: Record<string, unknown>, arkApiKey = '') {
  const resp = await fetch(`http://127.0.0.1:${PORT}/api/mcp/question-bank`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(arkApiKey ? { 'X-Ark-Api-Key': arkApiKey } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}_${Date.now()}`,
      method,
      params,
    }),
  })

  const text = await resp.text()
  let payload: JsonRpcEnvelope | null = null
  if (text) {
    try {
      payload = JSON.parse(text) as JsonRpcEnvelope
    } catch (_error) {
      throw new Error(`Question bank MCP returned non-JSON response (HTTP ${resp.status}): ${text.slice(0, 300)}`)
    }
  }

  if (!resp.ok) {
    const message =
      payload && typeof payload.error?.message === 'string'
        ? payload.error.message
        : `Question bank MCP request failed with HTTP ${resp.status}`
    throw new Error(message)
  }

  if (payload?.error?.message) {
    throw new Error(String(payload.error.message))
  }

  return payload?.result && typeof payload.result === 'object' ? payload.result : {}
}

export async function listQuestionBankMcpTools(arkApiKey = '') {
  const result = await requestQuestionBankMcp('tools/list', {}, arkApiKey)
  return Array.isArray(result.tools)
    ? result.tools.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : []
}
