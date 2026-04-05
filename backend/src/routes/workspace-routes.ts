import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { isValidTextbookPayload } from '../question-bank-service'
import { cleanupUploadedFiles, upload } from '../upload'
import {
  browseWorkspaceDirectory,
  cleanupWorkspaceDerivedFiles,
  createWorkspace,
  deleteWorkspace,
  getWorkspaceSummary,
  listWorkspaces,
  listMultiChapterSlots,
  overwriteMultiChapterSlotImages,
  rebuildMultiChapterSlots,
  resolveWorkspaceEntry,
} from '../workspace-store'
import { createWorkspaceDeliverableArchive, createWorkspaceSelectionArchive } from '../workspace-archive'

const router = Router()

function resolveWorkspaceErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.toLowerCase().includes('not found')) {
    return 404
  }
  if (message.toLowerCase().includes('has no uploads')) {
    return 404
  }
  if (message.toLowerCase().includes('has no question images')) {
    return 404
  }
  if (message.toLowerCase().includes('has no readable question images')) {
    return 404
  }
  if (message.toLowerCase().includes('workspaceid is required')) {
    return 400
  }
  if (message.toLowerCase().includes('outside of the workspace root')) {
    return 400
  }
  if (message.toLowerCase().includes('is not a directory')) {
    return 400
  }
  if (message.toLowerCase().includes('path not found')) {
    return 404
  }
  if (message.toLowerCase().includes('slotcount must be a positive integer')) {
    return 400
  }
  if (message.toLowerCase().includes('multi chapter slot not found')) {
    return 404
  }
  if (message.toLowerCase().includes('multi chapter slot json missing')) {
    return 409
  }
  if (message.toLowerCase().includes('images are required')) {
    return 400
  }
  return 500
}

router.get('/api/workspaces', async (_req: Request, res: Response) => {
  try {
    const workspaces = await listWorkspaces()
    return res.json({
      message: 'success',
      workspaces,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `List workspaces failed: ${msg}` })
  }
})

router.post('/api/workspaces', async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim()
    const summary = await createWorkspace({ name })
    return res.json({
      message: 'success',
      summary,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Create workspace failed: ${msg}` })
  }
})

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

router.get('/api/workspaces/:workspaceId/browser', async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const relativePath = String(req.query?.path || '').trim()
    const browser = await browseWorkspaceDirectory({
      workspaceId,
      relativePath,
    })
    return res.json({
      message: 'success',
      browser,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Browse workspace failed: ${msg}` })
  }
})

router.post('/api/workspaces/:workspaceId/multi-chapter/setup', async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const payload = req.body?.payload as unknown
    const slotCount = Number(req.body?.slotCount)

    if (!isValidTextbookPayload(payload)) {
      return res.status(400).json({ message: 'Invalid textbook payload format' })
    }

    const result = await rebuildMultiChapterSlots({
      workspaceId,
      jsonText: `${JSON.stringify(payload, null, 2)}\n`,
      slotCount,
    })
    return res.json({
      message: 'success',
      ...result,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Setup multi chapter slots failed: ${msg}` })
  }
})

router.get('/api/workspaces/:workspaceId/multi-chapter/slots', async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const slots = await listMultiChapterSlots(workspaceId)
    return res.json({
      message: 'success',
      slots,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `List multi chapter slots failed: ${msg}` })
  }
})

router.post('/api/workspaces/:workspaceId/multi-chapter/images', upload.array('images', 400), async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const slotRelativePath = String(req.body?.slotRelativePath || '').trim()
    const files = ((req.files as Express.Multer.File[] | undefined) || []).filter((file) => Number(file?.size) > 0)
    const result = await overwriteMultiChapterSlotImages({
      workspaceId,
      slotRelativePath,
      files,
    })
    return res.json({
      message: 'success',
      ...result,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Upload multi chapter slot images failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/workspaces/:workspaceId/cleanup', async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const result = await cleanupWorkspaceDerivedFiles({
      workspaceId,
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

router.get('/api/workspaces/:workspaceId/deliverable/download', async (req: Request, res: Response) => {
  let cleanupPaths: string[] = []
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const archive = await createWorkspaceDeliverableArchive(workspaceId)
    cleanupPaths = Array.isArray(archive.cleanupPaths) ? archive.cleanupPaths : [archive.archivePath]
    return res.download(archive.archivePath, archive.downloadFileName, async (error) => {
      for (const targetPath of cleanupPaths) {
        await fsp.rm(targetPath, { recursive: true, force: true }).catch(() => {})
      }
      if (error && !res.headersSent) {
        res.status(500).json({ message: `Download workspace deliverable failed: ${error.message}` })
      }
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Download workspace deliverable failed: ${msg}` })
  }
})

router.get('/api/workspaces/:workspaceId/download', async (req: Request, res: Response) => {
  let cleanupPaths: string[] = []
  try {
    const workspaceId = String(req.params?.workspaceId || '').trim()
    const relativePath = String(req.query?.path || '').trim()
    const entry = await resolveWorkspaceEntry({
      workspaceId,
      relativePath,
    })

    if (entry.isFile) {
      return res.download(entry.targetPath, path.basename(entry.targetPath), (error) => {
        if (error && !res.headersSent) {
          res.status(500).json({ message: `Download workspace file failed: ${error.message}` })
        }
      })
    }

    const archive = await createWorkspaceSelectionArchive({
      workspaceId,
      relativePath,
    })
    cleanupPaths = Array.isArray(archive.cleanupPaths) ? archive.cleanupPaths : [archive.archivePath]
    return res.download(archive.archivePath, archive.downloadFileName, async (error) => {
      for (const targetPath of cleanupPaths) {
        await fsp.rm(targetPath, { recursive: true, force: true }).catch(() => {})
      }
      if (error && !res.headersSent) {
        res.status(500).json({ message: `Download workspace folder failed: ${error.message}` })
      }
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveWorkspaceErrorStatus(error)).json({ message: `Download workspace entry failed: ${msg}` })
  }
})

export function registerWorkspaceRoutes(app: Router) {
  app.use(router)
}
