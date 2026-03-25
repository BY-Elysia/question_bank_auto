import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Router, type Request, type Response } from 'express'
import { runWithArkApiKey } from '../ark-request-context'
import { runQuestionBankAssistantChat } from '../question-bank-assistant-service'
import { createQuestionBankMcpServer } from '../question-bank-mcp-server'

const router = Router()

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

function sendMethodNotAllowed(res: Response) {
  return res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.',
    },
    id: null,
  })
}

function resolveErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes('至少需要一条用户消息') ||
    message.includes('SQL 不能为空') ||
    message.includes('只允许执行') ||
    message.includes('至少提供')
  ) {
    return 400
  }
  if (message.includes('ARK_API_KEY is missing')) {
    return 400
  }
  return 500
}

router.post('/api/mcp/question-bank', async (req: Request, res: Response) => {
  const server = createQuestionBankMcpServer()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  try {
    await runWithArkApiKey(getArkApiKeyFromRequest(req), async () => {
      await server.connect(transport)
      res.on('close', () => {
        void transport.close().catch(() => {})
        void server.close().catch(() => {})
      })
      await transport.handleRequest(req, res, req.body)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message,
        },
        id: null,
      })
    }
    await transport.close().catch(() => {})
    await server.close().catch(() => {})
  }
})

router.get('/api/mcp/question-bank', async (_req: Request, res: Response) => sendMethodNotAllowed(res))
router.delete('/api/mcp/question-bank', async (_req: Request, res: Response) => sendMethodNotAllowed(res))

router.post('/api/question-bank-assistant/chat', async (req: Request, res: Response) => {
  try {
    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      runQuestionBankAssistantChat({
        messages: req.body?.messages,
        maxToolSteps: req.body?.maxToolSteps,
      }),
    )

    return res.json({
      message: 'success',
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(resolveErrorStatus(error)).json({
      message: `Question bank assistant chat failed: ${message}`,
    })
  }
})

export function registerQuestionBankAssistantRoutes(app: Router) {
  app.use(router)
}
