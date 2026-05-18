import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { AEMEATH_AGENT_BASE_URL } from '../config'
import { listQuestionBankMcpTools } from '../question-bank-mcp-http-client'
import { cleanupUploadedFiles, normalizeUploadedOriginalName, upload } from '../upload'

const router = Router()

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

async function fetchJson(url: string, init?: RequestInit) {
  const resp = await fetch(url, init)
  const text = await resp.text()
  let data: unknown = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch (_error) {
      throw new Error(`Agent service returned non-JSON response (HTTP ${resp.status}): ${text.slice(0, 300)}`)
    }
  }
  return { resp, data }
}

function resolveAgentMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message
    }
    if (typeof record.detail === 'string' && record.detail.trim()) {
      return record.detail
    }
    if (record.detail && typeof record.detail === 'object') {
      const detail = record.detail as Record<string, unknown>
      if (Array.isArray(detail.config_errors) && detail.config_errors.length) {
        return detail.config_errors.map((item) => String(item || '').trim()).filter(Boolean).join('; ') || fallback
      }
    }
  }
  return fallback
}

function getAgentChatAttachments(req: Request) {
  return ((req.files as Express.Multer.File[] | undefined) || []).filter((file) => Number(file?.size) > 0)
}

function isSupportedAgentAttachment(fileName: string) {
  return /\.(pdf|png|jpe?g|webp)$/i.test(fileName)
}

router.get('/api/agent/bootstrap', async (req: Request, res: Response) => {
  const arkApiKey = getArkApiKeyFromRequest(req)

  let health: unknown = null
  let identity: unknown = null
  let agentAvailable = false
  let agentError = ''

  try {
    const [healthResult, identityResult] = await Promise.all([
      fetchJson(`${AEMEATH_AGENT_BASE_URL}/healthz`),
      fetchJson(`${AEMEATH_AGENT_BASE_URL}/identity`),
    ])

    if (!healthResult.resp.ok) {
      throw new Error(resolveAgentMessage(healthResult.data, `Agent health request failed with HTTP ${healthResult.resp.status}`))
    }
    if (!identityResult.resp.ok) {
      throw new Error(resolveAgentMessage(identityResult.data, `Agent identity request failed with HTTP ${identityResult.resp.status}`))
    }

    health = healthResult.data
    identity = identityResult.data
    agentAvailable = true
  } catch (error) {
    agentError = error instanceof Error ? error.message : String(error)
  }

  let mcpAvailable = false
  let mcpTools: string[] = []
  let mcpError = ''

  try {
    const tools = await listQuestionBankMcpTools(arkApiKey)
    mcpTools = tools
      .map((item) => String(item.name || '').trim())
      .filter(Boolean)
    mcpAvailable = true
  } catch (error) {
    mcpError = error instanceof Error ? error.message : String(error)
  }

  return res.json({
    message: 'success',
    agent: {
      available: agentAvailable,
      baseUrl: AEMEATH_AGENT_BASE_URL,
      health,
      identity,
      error: agentError || undefined,
    },
    mcp: {
      available: mcpAvailable,
      toolCount: mcpTools.length,
      tools: mcpTools,
      error: mcpError || undefined,
    },
  })
})

router.get('/api/agent/sessions', async (_req: Request, res: Response) => {
  try {
    const { resp, data } = await fetchJson(`${AEMEATH_AGENT_BASE_URL}/sessions`)
    if (!resp.ok) {
      return res.status(resp.status).json({
        message: resolveAgentMessage(data, `Agent session list failed with HTTP ${resp.status}`),
      })
    }
    return res.json(data)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    return res.status(503).json({
      message: `Aemeath Agent is unavailable: ${messageText}`,
    })
  }
})

router.get('/api/agent/sessions/:sessionId', async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId || '').trim()
  if (!sessionId) {
    return res.status(400).json({
      message: 'sessionId is required',
    })
  }

  try {
    const { resp, data } = await fetchJson(`${AEMEATH_AGENT_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`)
    if (!resp.ok) {
      return res.status(resp.status).json({
        message: resolveAgentMessage(data, `Agent session detail failed with HTTP ${resp.status}`),
      })
    }
    return res.json(data)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    return res.status(503).json({
      message: `Aemeath Agent is unavailable: ${messageText}`,
    })
  }
})

router.delete('/api/agent/sessions/:sessionId', async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId || '').trim()
  if (!sessionId) {
    return res.status(400).json({
      message: 'sessionId is required',
    })
  }

  try {
    const { resp, data } = await fetchJson(`${AEMEATH_AGENT_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) {
      return res.status(resp.status).json({
        message: resolveAgentMessage(data, `Agent session delete failed with HTTP ${resp.status}`),
      })
    }
    return res.json(data)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    return res.status(503).json({
      message: `Aemeath Agent is unavailable: ${messageText}`,
    })
  }
})

router.post('/api/agent/chat', upload.array('attachments', 20), async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '').trim()
  const message = String(req.body?.message || '').trim()
  if (!sessionId || !message) {
    return res.status(400).json({
      message: 'sessionId and message are required',
    })
  }

  const attachments = getAgentChatAttachments(req)

  try {
    let result: Awaited<ReturnType<typeof fetchJson>>
    if (attachments.length) {
      const form = new FormData()
      form.set('session_id', sessionId)
      form.set('message', message)
      for (const file of attachments) {
        const originalName = normalizeUploadedOriginalName(file.originalname || '') || path.basename(file.path)
        if (!isSupportedAgentAttachment(originalName)) {
          return res.status(400).json({
            message: `Unsupported attachment type: ${originalName}`,
          })
        }
        const buffer = await fsp.readFile(file.path)
        form.append(
          'attachments',
          new Blob([buffer], { type: file.mimetype || 'application/octet-stream' }),
          originalName,
        )
      }
      result = await fetchJson(`${AEMEATH_AGENT_BASE_URL}/chat/attachments`, {
        method: 'POST',
        headers: {
          ...(getArkApiKeyFromRequest(req) ? { 'X-Ark-Api-Key': getArkApiKeyFromRequest(req) } : {}),
        },
        body: form,
      })
    } else {
      result = await fetchJson(`${AEMEATH_AGENT_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getArkApiKeyFromRequest(req) ? { 'X-Ark-Api-Key': getArkApiKeyFromRequest(req) } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          message,
        }),
      })
    }

    const { resp, data } = result

    if (!resp.ok) {
      return res.status(resp.status).json({
        message: resolveAgentMessage(data, `Agent chat failed with HTTP ${resp.status}`),
      })
    }

    return res.json(data)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    return res.status(503).json({
      message: `Aemeath Agent is unavailable: ${messageText}`,
    })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/agent/actions/:actionId/confirm', async (req: Request, res: Response) => {
  const actionId = String(req.params.actionId || '').trim()
  if (!actionId) {
    return res.status(400).json({
      message: 'actionId is required',
    })
  }

  try {
    const { resp, data } = await fetchJson(`${AEMEATH_AGENT_BASE_URL}/actions/${encodeURIComponent(actionId)}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getArkApiKeyFromRequest(req) ? { 'X-Ark-Api-Key': getArkApiKeyFromRequest(req) } : {}),
      },
      body: JSON.stringify({
        confirm: req.body?.confirm !== false,
      }),
    })

    if (!resp.ok) {
      return res.status(resp.status).json({
        message: resolveAgentMessage(data, `Agent confirmation failed with HTTP ${resp.status}`),
      })
    }

    return res.json(data)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    return res.status(503).json({
      message: `Aemeath Agent is unavailable: ${messageText}`,
    })
  }
})

router.post('/api/agent/voice', async (req: Request, res: Response) => {
  const text = String(req.body?.text || '').trim()
  if (!text) {
    return res.status(400).json({
      message: 'text is required',
    })
  }

  try {
    const { resp, data } = await fetchJson(`${AEMEATH_AGENT_BASE_URL}/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    if (!resp.ok) {
      return res.status(resp.status).json({
        message: resolveAgentMessage(data, `Agent voice generation failed with HTTP ${resp.status}`),
      })
    }

    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const fileName =
      String(record.file_name || '').trim() ||
      String(record.audio_url || '')
        .split('/')
        .filter(Boolean)
        .pop() ||
      ''

    if (!fileName) {
      return res.status(502).json({
        message: 'Agent voice generation succeeded but no audio file was returned',
      })
    }

    return res.json({
      audio_url: `/api/agent/audio/${encodeURIComponent(fileName)}`,
      file_name: fileName,
    })
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    return res.status(503).json({
      message: `Aemeath Agent voice is unavailable: ${messageText}`,
    })
  }
})

router.get('/api/agent/audio/:fileName', async (req: Request, res: Response) => {
  const fileName = String(req.params.fileName || '').trim()
  if (!fileName) {
    return res.status(400).json({
      message: 'fileName is required',
    })
  }

  try {
    const upstream = await fetch(`${AEMEATH_AGENT_BASE_URL}/generated-audio/${encodeURIComponent(fileName)}`)
    if (!upstream.ok) {
      const text = await upstream.text()
      return res.status(upstream.status).json({
        message: text || `Agent audio fetch failed with HTTP ${upstream.status}`,
      })
    }

    const contentType = upstream.headers.get('content-type') || 'audio/wav'
    const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=3600'
    const arrayBuffer = await upstream.arrayBuffer()
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', cacheControl)
    return res.end(Buffer.from(arrayBuffer))
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    return res.status(503).json({
      message: `Aemeath Agent audio is unavailable: ${messageText}`,
    })
  }
})

export function registerAgentProxyRoutes(app: Router) {
  app.use(router)
}
