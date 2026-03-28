import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { OUTPUT_JSON_DIR } from '../config'
import { runWithArkApiKey } from '../ark-request-context'
import {
  batchId,
  isValidTextbookPayload,
  loadTextbookJson,
  normalizeJsonFileName,
  sanitizeFileName,
  toImageDataUrlFromFile,
} from '../question-bank-service'
import { mergeTextbookJsonFiles } from '../json-merge-service'
import { repairMathFormatInTextbookJson } from '../math-format-repair-service'
import { generateQuestionAnswerInTextbookJson } from '../question-answer-generate-service'
import { attachImagesToQuestionInTextbookJson } from '../question-image-attach-service'
import { repairQuestionInTextbookJson } from '../question-repair-service'
import { updateQuestionTypeInTextbookJson } from '../question-type-update-service'
import { upload } from '../upload'
import {
  readWorkspaceJsonText,
  resolveManagedJsonInput,
  writeWorkspaceJsonAsset,
  writeWorkspaceRepairSnapshot,
} from '../workspace-store'

const router = Router()

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

async function buildManagedJsonSnapshot(params: {
  workspaceId: string
  jsonFilePath: string
  sourceFileName?: string
}) {
  if (!params.workspaceId) {
    return null
  }

  const payload = await loadTextbookJson(params.jsonFilePath)
  return await writeWorkspaceRepairSnapshot({
    workspaceId: params.workspaceId,
    sourceFileName: params.sourceFileName,
    jsonFilePath: params.jsonFilePath,
    payload,
  })
}

router.post('/api/textbook-json/save', async (req: Request, res: Response) => {
  try {
    const payload = req.body?.payload as unknown
    const saveDir = String(req.body?.saveDir || '').trim()
    const fileNameInput = String(req.body?.fileName || '').trim()
    const workspaceId = String(req.body?.workspaceId || '').trim()

    if (!isValidTextbookPayload(payload)) {
      return res.status(400).json({ message: 'Invalid payload format' })
    }

    const fileName = normalizeJsonFileName(fileNameInput)
    const text = `${JSON.stringify(payload, null, 2)}\n`

    if (saveDir) {
      const dirStat = await fsp.stat(saveDir).catch(() => null)
      if (!dirStat || !dirStat.isDirectory()) {
        return res.status(400).json({ message: 'saveDir does not exist or is not a directory' })
      }

      const savePath = path.join(saveDir, fileName)
      await fsp.writeFile(savePath, text, { encoding: 'utf8' })
      return res.json({
        message: 'success',
        saveDir,
        fileName,
        savePath,
        workspaceId: '',
        jsonAssetId: '',
        filePath: savePath,
      })
    }

    const saved = await writeWorkspaceJsonAsset({
      workspaceId,
      fileName,
      text,
    })

    return res.json({
      message: 'success',
      saveDir: '',
      fileName: saved.asset.fileName,
      savePath: saved.filePath,
      workspaceId: saved.workspaceId,
      jsonAssetId: saved.asset.assetId,
      filePath: saved.filePath,
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

    const workspaceId = String(req.body?.workspaceId || '').trim()
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

    const legacyFileName = `${batchId()}_${sanitizeFileName(path.basename(originalName))}`
    const filePath = path.join(OUTPUT_JSON_DIR, legacyFileName)
    await fsp.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8' })

    const saved = await writeWorkspaceJsonAsset({
      workspaceId,
      fileName: originalName,
      text: `${JSON.stringify(parsed, null, 2)}\n`,
      workspaceName: path.basename(originalName, ext),
    })

    return res.json({
      message: 'success',
      fileName: saved.asset.fileName,
      filePath,
      workspaceId: saved.workspaceId,
      jsonAssetId: saved.asset.assetId,
      workspaceFilePath: saved.filePath,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Import json failed: ${msg}` })
  }
})

router.post('/api/textbook-json/read', async (req: Request, res: Response) => {
  try {
    const filePathRaw = String(req.body?.filePath || '').trim()
    const workspaceId = String(req.body?.workspaceId || '').trim()
    const jsonAssetId = String(req.body?.jsonAssetId || '').trim()

    const data = await readWorkspaceJsonText({
      workspaceId,
      jsonAssetId,
      filePath: filePathRaw,
    })

    return res.json({
      message: 'success',
      filePath: data.jsonFilePath,
      workspaceId: data.workspaceId,
      jsonAssetId: data.jsonAssetId,
      text: data.text,
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
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const chapterNo = Number(req.body?.chapterNo)
    const sectionNo = Number(req.body?.sectionNo)
    const questionNo = Number(req.body?.questionNo)
    const questionId = String(req.body?.questionId || '').trim()
    const sourceFileName = String(req.body?.sourceFileName || '').trim()
    const filesRaw = (req.files as Express.Multer.File[] | undefined) ?? []
    const files = filesRaw.filter((file) => /^(images?|repairImages?)$/i.test(file.fieldname))

    if (!files.length) {
      return res.status(400).json({ message: 'at least one image file is required' })
    }

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })

    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      repairQuestionInTextbookJson({
        jsonFilePath: resolved.jsonFilePath,
        chapterNo,
        sectionNo,
        questionNo,
        questionId,
        imageDataUrls: files.map((file) => toImageDataUrlFromFile(file)),
        imageLabels: files.map((file) => file.originalname || ''),
        sourceFileName,
      }),
    )

    const snapshot = await buildManagedJsonSnapshot({
      workspaceId: resolved.workspaceId,
      jsonFilePath: resolved.jsonFilePath,
      sourceFileName,
    })

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      repairJsonAssetId: snapshot?.asset.assetId || '',
      repairJsonWorkspacePath: snapshot?.filePath || '',
      repairJsonUrl: snapshot?.publicUrl || '',
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Repair question failed: ${msg}` })
  }
})

router.post('/api/textbook-json/repair-math-format', async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const sourceFileName = String(req.body?.sourceFileName || '').trim()
    const chapterNo = Number(req.body?.chapterNo)
    const sectionNo = Number(req.body?.sectionNo)
    const questionNo = Number(req.body?.questionNo)
    const questionId = String(req.body?.questionId || '').trim()
    const targetType = String(req.body?.targetType || '').trim()
    const childQuestionId = String(req.body?.childQuestionId || '').trim()
    const childNoRaw = req.body?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })

    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      repairMathFormatInTextbookJson({
        jsonFilePath: resolved.jsonFilePath,
        sourceFileName,
        chapterNo,
        sectionNo,
        questionNo,
        questionId,
        targetType: targetType as 'stem' | 'prompt' | 'standardAnswer' | 'childPrompt' | 'childStandardAnswer',
        childQuestionId,
        childNo,
      }),
    )

    const snapshot = await buildManagedJsonSnapshot({
      workspaceId: resolved.workspaceId,
      jsonFilePath: resolved.jsonFilePath,
      sourceFileName,
    })

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      repairJsonAssetId: snapshot?.asset.assetId || '',
      repairJsonWorkspacePath: snapshot?.filePath || '',
      repairJsonUrl: snapshot?.publicUrl || '',
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Repair math format failed: ${msg}` })
  }
})

router.post('/api/textbook-json/attach-images', upload.array('images', 20), async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const sourceFileName = String(req.body?.sourceFileName || '').trim()
    const chapterNo = Number(req.body?.chapterNo)
    const sectionNo = Number(req.body?.sectionNo)
    const questionNo = Number(req.body?.questionNo)
    const questionId = String(req.body?.questionId || '').trim()
    const childQuestionId = String(req.body?.childQuestionId || '').trim()
    const childNoRaw = req.body?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)
    const files = (req.files as Express.Multer.File[] | undefined) ?? []

    if (!files.length) {
      return res.status(400).json({ message: 'at least one image file is required' })
    }

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })

    const result = await attachImagesToQuestionInTextbookJson({
      jsonFilePath: resolved.jsonFilePath,
      sourceFileName,
      chapterNo,
      sectionNo,
      questionNo,
      questionId,
      childQuestionId,
      childNo,
      files,
    })

    const snapshot = await buildManagedJsonSnapshot({
      workspaceId: resolved.workspaceId,
      jsonFilePath: resolved.jsonFilePath,
      sourceFileName,
    })

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      repairJsonAssetId: snapshot?.asset.assetId || '',
      repairJsonWorkspacePath: snapshot?.filePath || '',
      repairJsonUrl: snapshot?.publicUrl || '',
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Attach images failed: ${msg}` })
  }
})

router.post('/api/textbook-json/generate-answer', async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const sourceFileName = String(req.body?.sourceFileName || '').trim()
    const questionId = String(req.body?.questionId || '').trim()
    const childQuestionId = String(req.body?.childQuestionId || '').trim()
    const answerPrompt = String(req.body?.answerPrompt || '').trim()
    const childNoRaw = req.body?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)

    if (!questionId) {
      return res.status(400).json({ message: 'questionId is required' })
    }

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })

    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      generateQuestionAnswerInTextbookJson({
        jsonFilePath: resolved.jsonFilePath,
        sourceFileName,
        questionId,
        childQuestionId,
        childNo,
        answerPrompt,
      }),
    )

    const snapshot = await buildManagedJsonSnapshot({
      workspaceId: resolved.workspaceId,
      jsonFilePath: resolved.jsonFilePath,
      sourceFileName,
    })

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      repairJsonAssetId: snapshot?.asset.assetId || '',
      repairJsonWorkspacePath: snapshot?.filePath || '',
      repairJsonUrl: snapshot?.publicUrl || '',
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Generate answer failed: ${msg}` })
  }
})

router.post('/api/textbook-json/update-question-type', async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const sourceFileName = String(req.body?.sourceFileName || '').trim()
    const questionId = String(req.body?.questionId || '').trim()
    const questionType = String(req.body?.questionType || '').trim()
    const childQuestionId = String(req.body?.childQuestionId || '').trim()
    const childNoRaw = req.body?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)

    if (!questionId) {
      return res.status(400).json({ message: 'questionId is required' })
    }
    if (!questionType) {
      return res.status(400).json({ message: 'questionType is required' })
    }

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })

    const result = await updateQuestionTypeInTextbookJson({
      jsonFilePath: resolved.jsonFilePath,
      sourceFileName,
      questionId,
      questionType,
      childQuestionId,
      childNo,
    })

    const snapshot = await buildManagedJsonSnapshot({
      workspaceId: resolved.workspaceId,
      jsonFilePath: resolved.jsonFilePath,
      sourceFileName,
    })

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      repairJsonAssetId: snapshot?.asset.assetId || '',
      repairJsonWorkspacePath: snapshot?.filePath || '',
      repairJsonUrl: snapshot?.publicUrl || '',
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Update question type failed: ${msg}` })
  }
})

export function registerTextbookJsonRoutes(app: Router) {
  app.use(router)
}
