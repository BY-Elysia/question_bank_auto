import fsp from 'node:fs/promises'
import path from 'node:path'
import { Router, type Request, type Response } from 'express'
import { runWithArkApiKey } from '../ark-request-context'
import {
  finalizeExamSections,
  previewExamSectionFromImages,
  previewExamSectionFromQuestionBank,
} from '../exam-section-compose-service'
import { initExamSession, processExamSessionImage } from '../exam-session-service'
import {
  getExamQuestionSession,
  getExamSession,
} from '../state'
import {
  isSupportedImageFileName,
  sortImageFileNames,
  toImageDataUrl,
  toImageDataUrlFromFile,
  writeNdjson,
} from '../question-bank-service'
import { cleanupUploadedFiles, upload } from '../upload'
import { resolveManagedJsonInput } from '../workspace-store'

const router = Router()

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

router.post('/api/exams/session/init', async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })

    const data = await initExamSession({
      jsonFilePath: resolved.jsonFilePath,
    })
    return res.json({
      ...data,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Init exam session failed: ${msg}` })
  }
})

router.post('/api/exams/sections/extract-from-images', upload.array('images', 30), async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const majorTitle = String(req.body?.majorTitle || '').trim()
    const minorTitle = String(req.body?.minorTitle || '').trim()
    const questionType = String(req.body?.questionType || '').trim()
    if (!majorTitle) {
      return res.status(400).json({ message: 'majorTitle is required' })
    }
    if (!questionType) {
      return res.status(400).json({ message: 'questionType is required' })
    }

    const files = ((req.files as Express.Multer.File[] | undefined) || []).filter((file) => Number(file?.size) > 0)
    if (!files.length) {
      return res.status(400).json({ message: 'images are required' })
    }

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })
    const imageDataUrls = await Promise.all(files.map((file) => toImageDataUrlFromFile(file)))
    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      previewExamSectionFromImages({
        jsonFilePath: resolved.jsonFilePath,
        majorTitle,
        minorTitle,
        questionType,
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
    return res.status(500).json({ message: `Extract exam section from images failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/exams/sections/append-from-library', async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const majorTitle = String(req.body?.majorTitle || '').trim()
    const minorTitle = String(req.body?.minorTitle || '').trim()
    const questionType = String(req.body?.questionType || '').trim()
    const recordIds = Array.isArray(req.body?.recordIds) ? req.body.recordIds : []
    if (!majorTitle) {
      return res.status(400).json({ message: 'majorTitle is required' })
    }
    if (!questionType) {
      return res.status(400).json({ message: 'questionType is required' })
    }
    if (!recordIds.length) {
      return res.status(400).json({ message: 'recordIds are required' })
    }

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })
    const result = await previewExamSectionFromQuestionBank({
      jsonFilePath: resolved.jsonFilePath,
      majorTitle,
      minorTitle,
      questionType,
      recordIds,
    })
    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Append exam section from question bank failed: ${msg}` })
  }
})

router.post('/api/exams/sections/finalize', async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const sections = Array.isArray(req.body?.sections) ? req.body.sections : []
    if (!sections.length) {
      return res.status(400).json({ message: 'sections are required' })
    }

    const resolved = await resolveManagedJsonInput({
      workspaceId: workspaceIdInput,
      jsonAssetId: jsonAssetIdInput,
      jsonFilePath: jsonFilePathRaw,
    })
    const result = await finalizeExamSections({
      jsonFilePath: resolved.jsonFilePath,
      sections,
    })
    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Finalize exam sections failed: ${msg}` })
  }
})

router.post('/api/exams/session/process-image', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'lookaheadImage', maxCount: 1 },
]), async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim()
    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!(await getExamSession(sessionId))) {
      return res.status(404).json({ message: 'session not found, please init first' })
    }

    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) || {}
    const imageFile = files.image?.[0]
    const lookaheadImageFile = files.lookaheadImage?.[0]
    if (!imageFile) {
      return res.status(400).json({ message: 'image file is required' })
    }

    const imageDataUrl = await toImageDataUrlFromFile(imageFile)
    const lookaheadImageDataUrl = lookaheadImageFile ? await toImageDataUrlFromFile(lookaheadImageFile) : ''
    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      processExamSessionImage({
        sessionId,
        imageDataUrl,
        imageLabel: imageFile.originalname || '',
        lookaheadImageDataUrl,
        lookaheadImageLabel: lookaheadImageFile?.originalname || '',
      }),
    )
    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Process exam image failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/exams/session/auto-run-stream', async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '').trim()
  const imageDirRaw = String(req.body?.imageDir || '').trim()

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' })
  }
  if (!imageDirRaw) {
    return res.status(400).json({ message: 'imageDir is required' })
  }
  if (!(await getExamSession(sessionId))) {
    return res.status(404).json({ message: 'session not found, please init first' })
  }

  const imageDir = path.resolve(imageDirRaw)
  const dirStat = await fsp.stat(imageDir).catch(() => null)
  if (!dirStat || !dirStat.isDirectory()) {
    return res.status(400).json({ message: 'imageDir does not exist or is not a directory' })
  }

  const names = sortImageFileNames((await fsp.readdir(imageDir)).filter((name) => isSupportedImageFileName(name)))
  if (!names.length) {
    return res.status(400).json({ message: 'no image files found in imageDir' })
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders?.()

  try {
    writeNdjson(res, {
      type: 'start',
      totalCount: names.length,
    })

    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]
      const imagePath = path.join(imageDir, name)
      const lookaheadName = index + 1 < names.length ? names[index + 1] : ''
      const lookaheadPath = lookaheadName ? path.join(imageDir, lookaheadName) : ''

      try {
        const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), async () =>
          processExamSessionImage({
            sessionId,
            imageDataUrl: await toImageDataUrl(imagePath),
            imageLabel: name,
            lookaheadImageDataUrl: lookaheadPath ? await toImageDataUrl(lookaheadPath) : '',
            lookaheadImageLabel: lookaheadName,
          }),
        )
        writeNdjson(res, {
          type: 'result',
          status: 'success',
          currentIndex: index + 1,
          totalCount: names.length,
          fileName: name,
          result,
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        writeNdjson(res, {
          type: 'result',
          status: 'failed',
          currentIndex: index + 1,
          totalCount: names.length,
          fileName: name,
          error: msg,
        })
      }
    }

    const latestSession = await getExamSession(sessionId)
    const latestQuestionSession = await getExamQuestionSession(sessionId)
    writeNdjson(res, {
      type: 'done',
      sessionId,
      currentMajorTitle: latestSession?.currentMajorTitle || '',
      currentMinorTitle: latestSession?.currentMinorTitle || '',
      currentStructureChapterId: latestQuestionSession?.currentStructureChapterId || '',
      pending: Boolean((latestQuestionSession?.pendingPageDataUrls || []).length),
    })
    res.end()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    writeNdjson(res, {
      type: 'fatal',
      error: msg,
    })
    res.end()
  }
})

export function registerExamSessionRoutes(app: Router) {
  app.use(router)
}
