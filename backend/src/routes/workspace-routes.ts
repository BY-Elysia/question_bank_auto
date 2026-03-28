import { Router, type Request, type Response } from 'express'
import {
  cleanupWorkspaceDerivedFiles,
  deleteWorkspace,
  getWorkspaceSummary,
} from '../workspace-store'

const router = Router()

function resolveWorkspaceErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.toLowerCase().includes('not found')) {
    return 404
  }
  if (message.toLowerCase().includes('workspaceid is required')) {
    return 400
  }
  return 500
}

router.get('/api/workspaces/:workspaceId/summary', async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const summary = await getWorkspaceSummary(workspaceId)
    return res.json({
      message: 'success',
      summary,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Read workspace summary failed: ${msg}` })
  }
})

router.post('/api/workspaces/:workspaceId/cleanup', async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const keepRepairSnapshots = Number(req.body?.keepRepairSnapshots)
    const result = await cleanupWorkspaceDerivedFiles({
      workspaceId,
      keepRepairSnapshots: Number.isFinite(keepRepairSnapshots) ? keepRepairSnapshots : undefined,
    })
    return res.json({
      message: 'success',
      ...result,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Cleanup workspace failed: ${msg}` })
  }
})

router.delete('/api/workspaces/:workspaceId', async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const result = await deleteWorkspace(workspaceId)
    return res.json({
      message: 'success',
      ...result,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Delete workspace failed: ${msg}` })
  }
})

export function registerWorkspaceRoutes(app: Router) {
  app.use(router)
}
