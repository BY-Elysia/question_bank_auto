import cors from 'cors'
import express, { type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import {
  FRONTEND_DIST_DIR,
  OUTPUT_DIR,
  READ_RESULTS_DIR,
  UPLOAD_DIR,
  WORKSPACES_DIR,
  WORKSPACE_DERIVED_RETENTION_DAYS,
  WORKSPACE_MAINTENANCE_INTERVAL_MS,
} from './config'
import { registerExamSessionRoutes } from './routes/exam-session-routes'
import { registerQuestionBankAssistantRoutes } from './routes/question-bank-assistant-routes'
import { registerQuestionBankDbRoutes } from './routes/question-bank-db-routes'
import { registerChapterSessionRoutes } from './routes/chapter-session-routes'
import { registerPdfRoutes } from './routes/pdf-routes'
import { registerTextbookJsonRoutes } from './routes/textbook-json-routes'
import { registerWorkspaceRoutes } from './routes/workspace-routes'
import { cleanupStaleWorkspaceDerivedAssets } from './workspace-store'

let workspaceMaintenanceStarted = false

function startWorkspaceMaintenance() {
  if (workspaceMaintenanceStarted) {
    return
  }
  workspaceMaintenanceStarted = true

  const runCleanup = async () => {
    try {
      await cleanupStaleWorkspaceDerivedAssets({
        retentionDays: WORKSPACE_DERIVED_RETENTION_DAYS,
      })
    } catch (error) {
      console.warn('[workspace-maintenance] cleanup failed:', error)
    }
  }

  void runCleanup()
  if (WORKSPACE_MAINTENANCE_INTERVAL_MS > 0) {
    setInterval(() => {
      void runCleanup()
    }, WORKSPACE_MAINTENANCE_INTERVAL_MS)
  }
}

export function createApp() {
  const app = express()

  fs.mkdirSync(WORKSPACES_DIR, { recursive: true })
  startWorkspaceMaintenance()
  app.use(cors())
  app.use(express.json({ limit: '20mb' }))
  app.use('/uploads', express.static(UPLOAD_DIR))
  app.use('/output_images', express.static(OUTPUT_DIR))
  app.use('/read_results', express.static(READ_RESULTS_DIR))
  app.use('/workspace-assets', express.static(WORKSPACES_DIR))

  registerPdfRoutes(app)
  registerTextbookJsonRoutes(app)
  registerWorkspaceRoutes(app)
  registerChapterSessionRoutes(app)
  registerExamSessionRoutes(app)
  registerQuestionBankDbRoutes(app)
  registerQuestionBankAssistantRoutes(app)

  if (fs.existsSync(FRONTEND_DIST_DIR)) {
    app.use(express.static(FRONTEND_DIST_DIR))
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'))
    })
  }

  return app
}
