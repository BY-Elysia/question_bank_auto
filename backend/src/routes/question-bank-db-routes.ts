import { Router, type Request, type Response } from 'express'
import {
  getQuestionBankDatabaseSummary,
  getQuestionBankQuestionTypeOptions,
  importQuestionBankJsonUploads,
  searchQuestionBankQuestions,
} from '../question-bank-db-service'
import { cleanupUploadedFiles, readUploadedFileText, upload } from '../upload'

const router = Router()

function resolveErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('请先在终端执行 npm run db:migrate') || message.includes('存在未执行迁移')) {
    return 409
  }
  if (message.includes('不是合法 JSON') || message.includes('不是支持的题库 JSON 结构') || message.includes('请至少上传一个 JSON 文件')) {
    return 400
  }
  return 500
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

router.post('/api/question-bank-db/questions/search', async (req: Request, res: Response) => {
  try {
    const items = await searchQuestionBankQuestions({
      query: req.body?.query,
      courseId: req.body?.courseId,
      textbookId: req.body?.textbookId,
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
