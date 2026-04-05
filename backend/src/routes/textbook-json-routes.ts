import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { OUTPUT_JSON_DIR } from '../config'
import { runWithArkApiKey } from '../ark-request-context'
import {
  batchId,
  isValidTextbookPayload,
  normalizeJsonFileName,
  sanitizeFileName,
  toImageDataUrlFromFile,
} from '../question-bank-service'
import { mergeTextbookJsonFiles } from '../json-merge-service'
import { repairMathFormatInTextbookJson } from '../math-format-repair-service'
import { generateQuestionAnswerInTextbookJson } from '../question-answer-generate-service'
import { attachImagesToQuestionInTextbookJson } from '../question-image-attach-service'
import { importUploadsFolderIntoServer } from '../upload-folder-import-service'
import { repairQuestionInTextbookJson } from '../question-repair-service'
import { updateQuestionTypeInTextbookJson } from '../question-type-update-service'
import { cleanupUploadedFiles, readUploadedFileText, upload } from '../upload'
import {
  readWorkspaceJsonText,
  resolveManagedJsonInput,
  resolveMultiChapterSlot,
  writeWorkspaceJsonAsset,
} from '../workspace-store'

const router = Router()

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

function toStringArray(value: unknown) {
  const rawItems = Array.isArray(value) ? value : value == null ? [] : [value]
  const normalized = rawItems
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return [...new Set(normalized)]
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

    if (!workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required; please create and select a workspace first' })
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
    if (!workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required; please create and select a workspace first' })
    }
    const originalName = req.file.originalname || 'textbook.json'
    const ext = path.extname(originalName).toLowerCase()
    if (ext !== '.json') {
      return res.status(400).json({ message: 'Only .json files are supported' })
    }

    const text = await readUploadedFileText(req.file)
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
  } finally {
    await cleanupUploadedFiles(req)
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

router.post('/api/textbook-json/download', async (req: Request, res: Response) => {
  try {
    const filePathRaw = String(req.body?.filePath || '').trim()
    const workspaceId = String(req.body?.workspaceId || '').trim()
    const jsonAssetId = String(req.body?.jsonAssetId || '').trim()

    const data = await readWorkspaceJsonText({
      workspaceId,
      jsonAssetId,
      filePath: filePathRaw,
    })

    const downloadFileName = String(data.fileName || 'main.json').trim() || 'main.json'
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.attachment(downloadFileName)
    return res.send(data.text)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Download json failed: ${msg}` })
  }
})

router.post('/api/textbook-json/merge', upload.array('jsonFiles', 30), async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    const outputFileName = String(req.body?.outputFileName || '').trim()
    const workspaceId = String(req.body?.workspaceId || '').trim()
    const slotRelativePaths = toStringArray(req.body?.slotRelativePaths)

    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase()
      if (ext !== '.json') {
        return res.status(400).json({ message: `Only .json files are supported: ${file.originalname}` })
      }
    }

    if (slotRelativePaths.length > 0 && !workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required when merging workspace multi chapter slots' })
    }

    const workspaceFiles = await Promise.all(
      slotRelativePaths.map(async (slotRelativePath) => {
        const slot = await resolveMultiChapterSlot({
          workspaceId,
          slotRelativePath,
        })
        return {
          fileName: slot.slotRelativePath || slot.jsonFileName,
          text: await fsp.readFile(slot.jsonFilePath, 'utf8'),
        }
      }),
    )

    const mergeFiles = [
      ...workspaceFiles,
      ...(await Promise.all(
        files.map(async (file) => ({
          fileName: file.originalname || 'textbook.json',
          text: await readUploadedFileText(file),
        })),
      )),
    ]

    if (mergeFiles.length < 2) {
      return res.status(400).json({
        message: slotRelativePaths.length > 0
          ? 'at least two workspace slotRelativePaths or jsonFiles are required'
          : 'at least two jsonFiles are required',
      })
    }

    const result = await mergeTextbookJsonFiles({
      files: mergeFiles,
      outputFileName,
      workspaceId: slotRelativePaths.length > 0 ? workspaceId : '',
    })

    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Merge json failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
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
    const childQuestionId = String(req.body?.childQuestionId || '').trim()
    const childNoRaw = req.body?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)
    const hasAnswerSourceRaw = String(req.body?.hasAnswerSource || '').trim().toLowerCase()
    const hasAnswerSource =
      hasAnswerSourceRaw === 'true' ? true : hasAnswerSourceRaw === 'false' ? false : null
    const generateAnswerIfMissingRaw = String(req.body?.generateAnswerIfMissing || '').trim().toLowerCase()
    const generateAnswerIfMissing =
      generateAnswerIfMissingRaw === 'true' ? true : generateAnswerIfMissingRaw === 'false' ? false : null
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

    const imageDataUrls = await Promise.all(files.map((file) => toImageDataUrlFromFile(file)))
    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      repairQuestionInTextbookJson({
        jsonFilePath: resolved.jsonFilePath,
        chapterNo,
        sectionNo,
        questionNo,
        questionId,
        childQuestionId,
        childNo,
        hasAnswerSource,
        generateAnswerIfMissing,
        imageDataUrls,
        imageLabels: files.map((file) => file.originalname || ''),
        sourceFileName,
      }),
    )

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const rawText =
      error && typeof error === 'object' && typeof (error as { rawText?: unknown }).rawText === 'string'
        ? String((error as { rawText?: string }).rawText || '')
        : ''
    return res.status(500).json({ message: `Repair question failed: ${msg}`, rawText })
  } finally {
    await cleanupUploadedFiles(req)
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

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
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
    const targetType = String(req.body?.targetType || '').trim()
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
      workspaceId: resolved.workspaceId,
      chapterNo,
      sectionNo,
      questionNo,
      questionId,
      childQuestionId,
      childNo,
      targetType: targetType === 'standardAnswer' ? 'standardAnswer' : 'prompt',
      files,
    })

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Attach images failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/textbook-json/import-uploads', upload.array('files', 2000), async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const clearTargetDir = String(req.body?.clearTargetDir || '').trim().toLowerCase() === 'true'
    const workspaceSourceRelativePath = String(req.body?.workspaceSourceRelativePath || '').trim()
    const relativePathsRaw = Array.isArray(req.body?.relativePaths)
      ? req.body.relativePaths
      : req.body?.relativePaths
        ? [req.body.relativePaths]
        : []

    if (!files.length && !workspaceSourceRelativePath) {
      return res.status(400).json({ message: 'at least one upload file is required, or workspaceSourceRelativePath must be provided' })
    }

    const relativePaths = relativePathsRaw.map((item: unknown) => String(item || ''))
    const resolved = jsonFilePathRaw || workspaceIdInput || jsonAssetIdInput
      ? await resolveManagedJsonInput({
          workspaceId: workspaceIdInput,
          jsonAssetId: jsonAssetIdInput,
          jsonFilePath: jsonFilePathRaw,
        })
      : {
          jsonFilePath: '',
          workspaceId: '',
          jsonAssetId: '',
        }

    if (!resolved.workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required; please create and select a workspace first' })
    }

    const result = await importUploadsFolderIntoServer({
      jsonFilePath: resolved.jsonFilePath,
      workspaceId: resolved.workspaceId,
      clearTargetDir,
      workspaceSourceRelativePath,
      files: files.map((file, index) => ({
        originalname: file.originalname,
        path: file.path,
        relativePath: relativePaths[index] || file.originalname,
      })),
    })

    return res.json({
      message: 'success',
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      importedCount: result.importedCount,
      rewrittenCount: result.rewrittenCount,
      matchedCount: result.matchedCount,
      uploadedFiles: result.uploadedFiles,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Import uploads failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/textbook-json/generate-answer', upload.any(), async (req: Request, res: Response) => {
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
    const filesRaw = (req.files as Express.Multer.File[] | undefined) ?? []
    const files = filesRaw.filter((file) => /^(images?|answerImages?)$/i.test(file.fieldname))

    if (!questionId) {
      return res.status(400).json({ message: 'questionId is required' })
    }

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })
    const imageDataUrls = await Promise.all(files.map((file) => toImageDataUrlFromFile(file)))

    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      generateQuestionAnswerInTextbookJson({
        jsonFilePath: resolved.jsonFilePath,
        sourceFileName,
        questionId,
        childQuestionId,
        childNo,
        answerPrompt,
        imageDataUrls,
      }),
    )

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Generate answer failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
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

    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Update question type failed: ${msg}` })
  }
})

export function registerTextbookJsonRoutes(app: Router) {
  app.use(router)
}
