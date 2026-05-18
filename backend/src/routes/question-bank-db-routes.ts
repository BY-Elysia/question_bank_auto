import { Router, type Request, type Response } from 'express'
import {
  getQuestionBankDatabaseSummary,
  getQuestionBankQuestionTypeOptions,
  importQuestionBankJsonUploads,
  listQuestionBankChapters,
  listQuestionBankSources,
  searchQuestionBankQuestions,
} from '../question-bank-db-service'
import { cleanupUploadedFiles, readUploadedFileText, upload } from '../upload'
import { readWorkspaceJsonText } from '../workspace-store'

const router = Router()

function resolveErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('请先在终端执行 npm run db:migrate') || message.includes('存在未执行迁移')) {
    return 409
  }
  if (message.includes('不是合法 JSON') || message.includes('不是支持的题库 JSON 结构') || message.includes('请至少上传一个 JSON 文件')) {
    return 400
  }
  const lower = message.toLowerCase()
  if (lower.includes('workspaceid is required') || lower.includes('jsonassetid is required') || lower.includes('outside of the workspace root')) {
    return 400
  }
  if (lower.includes('not found') || lower.includes('does not exist')) {
    return 404
  }
  return 500
}

function readQueryString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

router.post('/api/question-bank-db/import-upload', upload.array('jsonFiles', 50), async (req: Request, res: Response) => {
  try {
    const files = ((req.files as Express.Multer.File[] | undefined) || []).filter((file) =>
      (file.originalname || '').toLowerCase().endsWith('.json'),
    )

    const result = await importQuestionBankJsonUploads(
      await Promise.all(
        files.map(async (file) => ({
          fileName: file.originalname || 'question-bank.json',
          text: await readUploadedFileText(file),
        })),
      ),
    )

    return res.json({
      message: 'success',
      ...result,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveErrorStatus(error)).json({ message: `Import question bank db failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/question-bank-db/import-workspace-json', async (req: Request, res: Response) => {
  try {
    const workspaceId = String(req.body?.workspaceId || '').trim()
    const jsonAssetId = String(req.body?.jsonAssetId || '').trim()
    const jsonFilePath = String(req.body?.jsonFilePath || '').trim()
    const data = await readWorkspaceJsonText({
      workspaceId,
      jsonAssetId,
      filePath: jsonFilePath,
    })
    const result = await importQuestionBankJsonUploads([
      {
        fileName: data.fileName || 'question-bank.json',
        text: data.text,
      },
    ])

    return res.json({
      message: 'success',
      workspaceId: data.workspaceId,
      jsonAssetId: data.jsonAssetId,
      jsonFilePath: data.jsonFilePath,
      publicUrl: data.publicUrl,
      ...result,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveErrorStatus(error)).json({ message: `Import workspace question bank json failed: ${msg}` })
  }
})

router.get('/api/question-bank-db/summary', async (_req: Request, res: Response) => {
  try {
    const result = await getQuestionBankDatabaseSummary()
    return res.json({
      message: 'success',
      ...result,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveErrorStatus(error)).json({ message: `Read question bank db summary failed: ${msg}` })
  }
})

router.get('/api/question-bank-db/question-types', async (_req: Request, res: Response) => {
  try {
    return res.json({
      message: 'success',
      items: getQuestionBankQuestionTypeOptions(),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveErrorStatus(error)).json({ message: `Read question bank question types failed: ${msg}` })
  }
})

router.get('/api/question-bank-db/sources', async (req: Request, res: Response) => {
  try {
    const items = await listQuestionBankSources({
      courseId: readQueryString(req.query?.courseId),
      documentType: readQueryString(req.query?.documentType),
    })
    return res.json({
      message: 'success',
      items,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveErrorStatus(error)).json({ message: `Read question bank sources failed: ${msg}` })
  }
})

router.get('/api/question-bank-db/sources/:sourceId/chapters', async (req: Request, res: Response) => {
  try {
    const items = await listQuestionBankChapters({
      textbookId: readQueryString(req.params?.sourceId),
      courseId: readQueryString(req.query?.courseId),
      documentType: readQueryString(req.query?.documentType),
    })
    return res.json({
      message: 'success',
      items,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveErrorStatus(error)).json({ message: `Read question bank chapters failed: ${msg}` })
  }
})

router.post('/api/question-bank-db/questions/search', async (req: Request, res: Response) => {
  try {
    const items = await searchQuestionBankQuestions({
      query: req.body?.query,
      courseId: req.body?.courseId,
      textbookId: req.body?.textbookId,
      chapterId: req.body?.chapterId,
      documentType: req.body?.documentType,
      questionType: req.body?.questionType,
      limit: req.body?.limit,
    })
    return res.json({
      message: 'success',
      items,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(resolveErrorStatus(error)).json({ message: `Search question bank questions failed: ${msg}` })
  }
})

export function registerQuestionBankDbRoutes(app: Router) {
  app.use(router)
}
