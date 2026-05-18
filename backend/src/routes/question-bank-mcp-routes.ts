import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Router, type Request, type Response } from 'express'
import { runWithArkApiKey } from '../ark-request-context'
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

router.post('/api/mcp/question-bank', async (req: Request, res: Response) => {
  const server = createQuestionBankMcpServer()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
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

export function registerQuestionBankMcpRoutes(app: Router) {
  app.use(router)
}
