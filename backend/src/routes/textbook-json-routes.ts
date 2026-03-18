import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { OUTPUT_JSON_DIR } from '../config'
import {
  batchId,
  isValidTextbookPayload,
  normalizeJsonFileName,
  normalizeJsonPath,
  sanitizeFileName,
  toImageDataUrlFromFile,
} from '../question-bank-service'
import { mergeTextbookJsonFiles } from '../json-merge-service'
import { repairMathFormatInTextbookJson } from '../math-format-repair-service'
import { attachImagesToQuestionInTextbookJson } from '../question-image-attach-service'
import { repairQuestionInTextbookJson } from '../question-repair-service'
import { upload } from '../upload'

const router = Router()

router.post('/api/textbook-json/save', async (req: Request, res: Response) => {
  try {
    const payload = req.body?.payload as unknown
    const saveDir = String(req.body?.saveDir || '').trim()
    const fileNameInput = String(req.body?.fileName || '').trim()

    if (!isValidTextbookPayload(payload)) {
      return res.status(400).json({ message: 'Invalid payload format' })
    }
    if (!saveDir) {
      return res.status(400).json({ message: 'saveDir is required' })
    }

    const dirStat = await fsp.stat(saveDir).catch(() => null)
    if (!dirStat || !dirStat.isDirectory()) {
      return res.status(400).json({ message: 'saveDir does not exist or is not a directory' })
    }

    const fileName = normalizeJsonFileName(fileNameInput)
    const savePath = path.join(saveDir, fileName)
    const text = `${JSON.stringify(payload, null, 2)}\n`
    await fsp.writeFile(savePath, text, { encoding: 'utf8' })

    return res.json({
      message: 'success',
      saveDir,
      fileName,
      savePath,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Save json failed: ${msg}` })
  }
})

router.post('/api/textbook-json/import', upload.single('json'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'json file is required' })
    }

    const originalName = req.file.originalname || 'textbook.json'
    const ext = path.extname(originalName).toLowerCase()
    if (ext !== '.json') {
      return res.status(400).json({ message: 'Only .json files are supported' })
    }

    const text = req.file.buffer.toString('utf8')
    const parsed = JSON.parse(text) as unknown
    if (!isValidTextbookPayload(parsed)) {
      return res.status(400).json({ message: 'Invalid textbook JSON structure' })
    }

    const fileName = `${batchId()}_${sanitizeFileName(path.basename(originalName))}`
    const filePath = path.join(OUTPUT_JSON_DIR, fileName)
    await fsp.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8' })

    return res.json({
      message: 'success',
      fileName,
      filePath,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Import json failed: ${msg}` })
  }
})

router.post('/api/textbook-json/read', async (req: Request, res: Response) => {
  try {
    const filePathRaw = String(req.body?.filePath || '').trim()
    if (!filePathRaw) {
      return res.status(400).json({ message: 'filePath is required' })
    }

    const filePath = normalizeJsonPath(filePathRaw)
    const fileStat = await fsp.stat(filePath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) {
      return res.status(400).json({ message: 'filePath does not exist or is not a file' })
    }

    const text = await fsp.readFile(filePath, 'utf8')
    return res.json({
      message: 'success',
      filePath,
      text,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Read json failed: ${msg}` })
  }
})

router.post('/api/textbook-json/merge', upload.array('jsonFiles', 30), async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    const outputFileName = String(req.body?.outputFileName || '').trim()

    if (files.length < 2) {
      return res.status(400).json({ message: 'at least two jsonFiles are required' })
    }

    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase()
      if (ext !== '.json') {
        return res.status(400).json({ message: `Only .json files are supported: ${file.originalname}` })
      }
    }

    const result = await mergeTextbookJsonFiles({
      files: files.map((file) => ({
        fileName: file.originalname || 'textbook.json',
        text: file.buffer.toString('utf8'),
      })),
      outputFileName,
    })

    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Merge json failed: ${msg}` })
  }
})

router.post('/api/textbook-json/repair-question', upload.any(), async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const chapterNo = Number(req.body?.chapterNo)
    const sectionNo = Number(req.body?.sectionNo)
    const questionNo = Number(req.body?.questionNo)
    const sourceFileName = String(req.body?.sourceFileName || '').trim()
    const filesRaw = (req.files as Express.Multer.File[] | undefined) ?? []
    const files = filesRaw.filter((file) => /^(images?|repairImages?)$/i.test(file.fieldname))

    if (!jsonFilePathRaw) {
      return res.status(400).json({ message: 'jsonFilePath is required' })
    }
    if (!files.length) {
      return res.status(400).json({ message: 'at least one image file is required' })
    }

    const jsonFilePath = normalizeJsonPath(jsonFilePathRaw)
    const fileStat = await fsp.stat(jsonFilePath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) {
      return res.status(400).json({ message: 'jsonFilePath does not exist or is not a file' })
    }

    const result = await repairQuestionInTextbookJson({
      jsonFilePath,
      chapterNo,
      sectionNo,
      questionNo,
      imageDataUrls: files.map((file) => toImageDataUrlFromFile(file)),
      imageLabels: files.map((file) => file.originalname || ''),
      sourceFileName,
    })

    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Repair question failed: ${msg}` })
  }
})

router.post('/api/textbook-json/repair-math-format', async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const sourceFileName = String(req.body?.sourceFileName || '').trim()
    const chapterNo = Number(req.body?.chapterNo)
    const sectionNo = Number(req.body?.sectionNo)
    const questionNo = Number(req.body?.questionNo)
    const targetType = String(req.body?.targetType || '').trim()
    const childNoRaw = req.body?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)

    if (!jsonFilePathRaw) {
      return res.status(400).json({ message: 'jsonFilePath is required' })
    }

    const jsonFilePath = normalizeJsonPath(jsonFilePathRaw)
    const fileStat = await fsp.stat(jsonFilePath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) {
      return res.status(400).json({ message: 'jsonFilePath does not exist or is not a file' })
    }

    const result = await repairMathFormatInTextbookJson({
      jsonFilePath,
      sourceFileName,
      chapterNo,
      sectionNo,
      questionNo,
      targetType: targetType as 'stem' | 'prompt' | 'standardAnswer' | 'childPrompt' | 'childStandardAnswer',
      childNo,
    })

    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Repair math format failed: ${msg}` })
  }
})

router.post('/api/textbook-json/attach-images', upload.array('images', 20), async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const sourceFileName = String(req.body?.sourceFileName || '').trim()
    const chapterNo = Number(req.body?.chapterNo)
    const sectionNo = Number(req.body?.sectionNo)
    const questionNo = Number(req.body?.questionNo)
    const childNoRaw = req.body?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)
    const files = (req.files as Express.Multer.File[] | undefined) ?? []

    if (!jsonFilePathRaw) {
      return res.status(400).json({ message: 'jsonFilePath is required' })
    }
    if (!files.length) {
      return res.status(400).json({ message: 'at least one image file is required' })
    }

    const jsonFilePath = normalizeJsonPath(jsonFilePathRaw)
    const fileStat = await fsp.stat(jsonFilePath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) {
      return res.status(400).json({ message: 'jsonFilePath does not exist or is not a file' })
    }

    const result = await attachImagesToQuestionInTextbookJson({
      jsonFilePath,
      sourceFileName,
      chapterNo,
      sectionNo,
      questionNo,
      childNo,
      files,
    })

    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Attach images failed: ${msg}` })
  }
})

export function registerTextbookJsonRoutes(app: Router) {
  app.use(router)
}
