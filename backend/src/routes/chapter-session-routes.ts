import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { READ_RESULTS_DIR } from '../config'
import { runWithArkApiKey } from '../ark-request-context'
import {
  appendChapterSegmentFromImagesWithResponsesPrefixCache,
  processChapterSessionImageWithResponsesPrefixCache,
} from '../question-bank-responses-experiment'
import {
  appendAutoProcessFailureLog,
  appendChapterSegmentFromImages,
  batchId,
  ensureSectionChapter,
  ensureTopChapter,
  isSupportedImageFileName,
  loadTextbookJson,
  normalizeTitle,
  processChapterSessionImage,
  saveTextbookJson,
  sortImageFileNames,
  toImageDataUrl,
  toImageDataUrlFromFile,
  writeNdjson,
} from '../question-bank-service'
import {
  getChapterSession,
  getQuestionSession,
  setChapterSession,
  setQuestionSession,
} from '../state'
import { cleanupUploadedFiles, upload } from '../upload'
import { resolveManagedJsonInput, resolveMultiChapterSlot } from '../workspace-store'

const router = Router()

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

function getSlotRelativePathFromBody(body: unknown) {
  return String((body as Record<string, unknown> | null)?.slotRelativePath || '').trim()
}

async function resolveChapterSessionTargetFromBody(body: unknown) {
  const slotRelativePath = getSlotRelativePathFromBody(body)
  const workspaceIdInput = String((body as Record<string, unknown> | null)?.workspaceId || '').trim()
  if (slotRelativePath) {
    const slot = await resolveMultiChapterSlot({
      workspaceId: workspaceIdInput,
      slotRelativePath,
    })
    return {
      jsonFilePath: slot.jsonFilePath,
      workspaceId: slot.workspaceId,
      jsonAssetId: '',
      slotRelativePath: slot.slotRelativePath,
      slotName: slot.slotName,
      imagesDirPath: slot.imagesDirPath,
    }
  }

  const resolved = await resolveManagedJsonInput({
    workspaceId: workspaceIdInput,
    jsonAssetId: String((body as Record<string, unknown> | null)?.jsonAssetId || '').trim(),
    jsonFilePath: String((body as Record<string, unknown> | null)?.jsonFilePath || '').trim(),
  })
  return {
    jsonFilePath: resolved.jsonFilePath,
    workspaceId: resolved.workspaceId,
    jsonAssetId: resolved.jsonAssetId,
    slotRelativePath: '',
    slotName: '',
    imagesDirPath: '',
  }
}

async function resolveChapterSessionImageDirFromBody(body: unknown) {
  const slotRelativePath = getSlotRelativePathFromBody(body)
  const workspaceIdInput = String((body as Record<string, unknown> | null)?.workspaceId || '').trim()
  if (slotRelativePath) {
    const slot = await resolveMultiChapterSlot({
      workspaceId: workspaceIdInput,
      slotRelativePath,
    })
    return {
      imageDir: slot.imagesDirPath,
      slotRelativePath: slot.slotRelativePath,
      slotName: slot.slotName,
      workspaceId: slot.workspaceId,
    }
  }

  const imageDirRaw = String((body as Record<string, unknown> | null)?.imageDir || '').trim()
  if (!imageDirRaw) {
    throw new Error('imageDir is required')
  }
  return {
    imageDir: path.resolve(imageDirRaw),
    slotRelativePath: '',
    slotName: '',
    workspaceId: workspaceIdInput,
  }
}

router.post('/api/chapters/session/init', async (req: Request, res: Response) => {
  try {
    const currentChapterTitleRaw = String(req.body?.currentChapterTitle || '').trim()
    const currentSectionTitleRaw = String(req.body?.currentSectionTitle || '').trim()

    if (!currentChapterTitleRaw || !currentSectionTitleRaw) {
      return res.status(400).json({ message: 'currentChapterTitle and currentSectionTitle are required' })
    }

    const resolved = await resolveChapterSessionTargetFromBody(req.body)

    const payload = await loadTextbookJson(resolved.jsonFilePath)
    const chapter = ensureTopChapter(payload, currentChapterTitleRaw)
    const section = ensureSectionChapter(payload, chapter.chapterId, currentSectionTitleRaw)
    await saveTextbookJson(resolved.jsonFilePath, payload)

    const sessionId = batchId()
    const chapterSession = {
      sessionId,
      jsonFilePath: resolved.jsonFilePath,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      currentChapterTitle: normalizeTitle(currentChapterTitleRaw),
      currentSectionTitle: normalizeTitle(currentSectionTitleRaw),
      updatedAt: new Date().toISOString(),
    }
    await setChapterSession(sessionId, chapterSession)
    await setQuestionSession(sessionId, {
      sessionId,
      jsonFilePath: resolved.jsonFilePath,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      currentChapterTitle: chapterSession.currentChapterTitle,
      currentSectionTitle: chapterSession.currentSectionTitle,
      currentSectionChapterId: section.chapterId,
      pendingPageDataUrls: [],
      pendingPageLabels: [],
      pendingContinueQuestionKey: null,
      processingStartQuestionKey: null,
      pendingReason: null,
      pendingUpsertedCount: 0,
      updatedAt: new Date().toISOString(),
    })

    return res.json({
      message: 'success',
      sessionId,
      jsonFilePath: resolved.jsonFilePath,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
      slotRelativePath: resolved.slotRelativePath,
      currentChapterTitle: chapterSession.currentChapterTitle,
      currentSectionTitle: chapterSession.currentSectionTitle,
      currentSectionChapterId: section.chapterId,
      chaptersCount: payload.chapters.length,
      questionsCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Init chapter session failed: ${msg}` })
  }
})

router.post('/api/chapters/session/process-image', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'lookaheadImage', maxCount: 1 },
]), async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim()
    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!(await getChapterSession(sessionId))) {
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
      processChapterSessionImage({
        sessionId,
        imageDataUrl,
        imageLabel: imageFile.originalname || '',
        lookaheadImageDataUrl,
        lookaheadImageLabel: lookaheadImageFile?.originalname || '',
        overrideChapterTitle: String(req.body?.currentChapterTitle || '').trim(),
        overrideSectionTitle: String(req.body?.currentSectionTitle || '').trim(),
      }),
    )
    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Process chapter image failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/chapters/session/process-image-responses', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'lookaheadImage', maxCount: 1 },
]), async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim()
    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!(await getChapterSession(sessionId))) {
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
      processChapterSessionImageWithResponsesPrefixCache({
        sessionId,
        imageDataUrl,
        imageLabel: imageFile.originalname || '',
        lookaheadImageDataUrl,
        lookaheadImageLabel: lookaheadImageFile?.originalname || '',
        overrideChapterTitle: String(req.body?.currentChapterTitle || '').trim(),
        overrideSectionTitle: String(req.body?.currentSectionTitle || '').trim(),
      }),
    )
    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Process chapter image with responses prefix cache failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/chapters/segments/append-from-images', upload.array('images', 40), async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const chapterTitle = String(req.body?.chapterTitle || '').trim()
    const sectionTitle = String(req.body?.sectionTitle || '').trim()
    if (!chapterTitle || !sectionTitle) {
      return res.status(400).json({ message: 'chapterTitle and sectionTitle are required' })
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
      appendChapterSegmentFromImages({
        jsonFilePath: resolved.jsonFilePath,
        chapterTitle,
        sectionTitle,
        imageDataUrls,
        imageLabels: files.map((file) => file.originalname || ''),
      }),
    )
    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Append chapter segment from images failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/chapters/segments/append-from-images-responses', upload.array('images', 40), async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    const jsonAssetIdInput = String(req.body?.jsonAssetId || '').trim()
    const chapterTitle = String(req.body?.chapterTitle || '').trim()
    const sectionTitle = String(req.body?.sectionTitle || '').trim()
    if (!chapterTitle || !sectionTitle) {
      return res.status(400).json({ message: 'chapterTitle and sectionTitle are required' })
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
      appendChapterSegmentFromImagesWithResponsesPrefixCache({
        jsonFilePath: resolved.jsonFilePath,
        chapterTitle,
        sectionTitle,
        imageDataUrls,
        imageLabels: files.map((file) => file.originalname || ''),
      }),
    )
    return res.json({
      ...result,
      workspaceId: resolved.workspaceId,
      jsonAssetId: resolved.jsonAssetId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Append chapter segment from images with responses prefix cache failed: ${msg}` })
  } finally {
    await cleanupUploadedFiles(req)
  }
})

router.post('/api/chapters/session/auto-run', async (req: Request, res: Response) => {
  try {
    const arkApiKey = getArkApiKeyFromRequest(req)
    const sessionId = String(req.body?.sessionId || '').trim()
    const overrideChapterTitle = String(req.body?.currentChapterTitle || '').trim()
    const overrideSectionTitle = String(req.body?.currentSectionTitle || '').trim()

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!(await getChapterSession(sessionId))) {
      return res.status(404).json({ message: 'session not found, please init first' })
    }

    const imageTarget = await resolveChapterSessionImageDirFromBody(req.body)
    const imageDir = imageTarget.imageDir
    const dirStat = await fsp.stat(imageDir).catch(() => null)
    if (!dirStat || !dirStat.isDirectory()) {
      return res.status(400).json({ message: 'imageDir does not exist or is not a directory' })
    }

    const names = sortImageFileNames((await fsp.readdir(imageDir)).filter((name) => isSupportedImageFileName(name)))
    if (!names.length) {
      return res.status(400).json({ message: 'no image files found in imageDir' })
    }

    const results = []
    let successCount = 0
    let failedCount = 0
    let firstImage = true

    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]
      const imagePath = path.join(imageDir, name)
      try {
        const imageDataUrl = await toImageDataUrl(imagePath)
        const lookaheadName = index + 1 < names.length ? names[index + 1] : ''
        const lookaheadImagePath = lookaheadName ? path.join(imageDir, lookaheadName) : ''
        const lookaheadImageDataUrl = lookaheadImagePath ? await toImageDataUrl(lookaheadImagePath) : ''
        const result = await runWithArkApiKey(arkApiKey, () =>
          processChapterSessionImage({
            sessionId,
            imageDataUrl,
            imageLabel: name,
            lookaheadImageDataUrl,
            lookaheadImageLabel: lookaheadName,
            overrideChapterTitle: firstImage ? overrideChapterTitle : '',
            overrideSectionTitle: firstImage ? overrideSectionTitle : '',
          }),
        )
        firstImage = false
        successCount += 1
        results.push({
          fileName: name,
          imagePath,
          status: 'success',
          currentChapterTitle: result.currentChapterTitle,
          currentSectionTitle: result.currentSectionTitle,
          question: result.question,
        })
      } catch (error) {
        failedCount += 1
        const msg = error instanceof Error ? error.message : String(error)
        await appendAutoProcessFailureLog({
          sessionId,
          imagePath,
          error: msg,
        })
        results.push({
          fileName: name,
          imagePath,
          status: 'failed',
          error: msg,
        })
      }
    }

    const latestSession = await getChapterSession(sessionId)
    const latestQuestionSession = await getQuestionSession(sessionId)
    return res.json({
      message: 'success',
      sessionId,
      imageDir,
      slotRelativePath: imageTarget.slotRelativePath,
      totalCount: names.length,
      successCount,
      failedCount,
      currentChapterTitle: latestSession?.currentChapterTitle || '',
      currentSectionTitle: latestSession?.currentSectionTitle || '',
      pending: (latestQuestionSession?.pendingPageDataUrls || []).length > 0,
      pendingContinueQuestionKey: latestQuestionSession?.pendingContinueQuestionKey || null,
      failureLogPath: path.join(READ_RESULTS_DIR, 'auto_process_failures.jsonl'),
      results,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Auto run failed: ${msg}` })
  }
})

router.post('/api/chapters/session/auto-run-stream-responses', async (req: Request, res: Response) => {
  let streamStarted = false
  try {
    const arkApiKey = getArkApiKeyFromRequest(req)
    const sessionId = String(req.body?.sessionId || '').trim()
    const overrideChapterTitle = String(req.body?.currentChapterTitle || '').trim()
    const overrideSectionTitle = String(req.body?.currentSectionTitle || '').trim()

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!(await getChapterSession(sessionId))) {
      return res.status(404).json({ message: 'session not found, please init first' })
    }

    const imageTarget = await resolveChapterSessionImageDirFromBody(req.body)
    const imageDir = imageTarget.imageDir
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
    res.setHeader('Connection', 'keep-alive')
    streamStarted = true
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders()
    }

    const streamStartSession = await getChapterSession(sessionId)
    writeNdjson(res, {
      type: 'start',
      sessionId,
      imageDir,
      slotRelativePath: imageTarget.slotRelativePath,
      totalCount: names.length,
      currentChapterTitle: overrideChapterTitle || streamStartSession?.currentChapterTitle || '',
      currentSectionTitle: overrideSectionTitle || streamStartSession?.currentSectionTitle || '',
      mode: 'responses-prefix-experiment',
    })

    const results = []
    let successCount = 0
    let failedCount = 0
    let firstImage = true

    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]
      const imagePath = path.join(imageDir, name)
      writeNdjson(res, {
        type: 'progress',
        stage: 'processing',
        currentIndex: index + 1,
        totalCount: names.length,
        fileName: name,
        imagePath,
        mode: 'responses-prefix-experiment',
      })

      try {
        const imageDataUrl = await toImageDataUrl(imagePath)
        const lookaheadName = index + 1 < names.length ? names[index + 1] : ''
        const lookaheadImagePath = lookaheadName ? path.join(imageDir, lookaheadName) : ''
        const lookaheadImageDataUrl = lookaheadImagePath ? await toImageDataUrl(lookaheadImagePath) : ''
        const result = await runWithArkApiKey(arkApiKey, () =>
          processChapterSessionImageWithResponsesPrefixCache({
            sessionId,
            imageDataUrl,
            imageLabel: name,
            lookaheadImageDataUrl,
            lookaheadImageLabel: lookaheadName,
            overrideChapterTitle: firstImage ? overrideChapterTitle : '',
            overrideSectionTitle: firstImage ? overrideSectionTitle : '',
          }),
        )
        firstImage = false
        successCount += 1
        const item = {
          fileName: name,
          imagePath,
          status: 'success',
          currentIndex: index + 1,
          totalCount: names.length,
          currentChapterTitle: result.currentChapterTitle,
          currentSectionTitle: result.currentSectionTitle,
          question: result.question,
          prefixCacheExperiment: result.prefixCacheExperiment || null,
        }
        results.push(item)
        writeNdjson(res, {
          type: 'result',
          ...item,
        })
      } catch (error) {
        failedCount += 1
        const msg = error instanceof Error ? error.message : String(error)
        await appendAutoProcessFailureLog({
          sessionId,
          imagePath,
          error: msg,
        })
        const item = {
          fileName: name,
          imagePath,
          status: 'failed',
          currentIndex: index + 1,
          totalCount: names.length,
          error: msg,
        }
        results.push(item)
        writeNdjson(res, {
          type: 'result',
          ...item,
        })
      }
    }

    const latestSession = await getChapterSession(sessionId)
    const latestQuestionSession = await getQuestionSession(sessionId)
    writeNdjson(res, {
      type: 'done',
      sessionId,
      imageDir,
      slotRelativePath: imageTarget.slotRelativePath,
      totalCount: names.length,
      successCount,
      failedCount,
      currentChapterTitle: latestSession?.currentChapterTitle || '',
      currentSectionTitle: latestSession?.currentSectionTitle || '',
      pending: (latestQuestionSession?.pendingPageDataUrls || []).length > 0,
      pendingContinueQuestionKey: latestQuestionSession?.pendingContinueQuestionKey || null,
      failureLogPath: path.join(READ_RESULTS_DIR, 'auto_process_failures.jsonl'),
      results,
      mode: 'responses-prefix-experiment',
    })
    return res.end()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (!streamStarted) {
      return res.status(500).json({ message: `Auto run with responses prefix cache failed: ${msg}` })
    }
    writeNdjson(res, {
      type: 'error',
      message: `Auto run with responses prefix cache failed: ${msg}`,
      mode: 'responses-prefix-experiment',
    })
    return res.end()
  }
})

router.post('/api/chapters/session/auto-run-stream', async (req: Request, res: Response) => {
  let streamStarted = false
  try {
    const arkApiKey = getArkApiKeyFromRequest(req)
    const sessionId = String(req.body?.sessionId || '').trim()
    const overrideChapterTitle = String(req.body?.currentChapterTitle || '').trim()
    const overrideSectionTitle = String(req.body?.currentSectionTitle || '').trim()

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!(await getChapterSession(sessionId))) {
      return res.status(404).json({ message: 'session not found, please init first' })
    }

    const imageTarget = await resolveChapterSessionImageDirFromBody(req.body)
    const imageDir = imageTarget.imageDir
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
    res.setHeader('Connection', 'keep-alive')
    streamStarted = true
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders()
    }

    const streamStartSession = await getChapterSession(sessionId)
    writeNdjson(res, {
      type: 'start',
      sessionId,
      imageDir,
      slotRelativePath: imageTarget.slotRelativePath,
      totalCount: names.length,
      currentChapterTitle: overrideChapterTitle || streamStartSession?.currentChapterTitle || '',
      currentSectionTitle: overrideSectionTitle || streamStartSession?.currentSectionTitle || '',
    })

    const results = []
    let successCount = 0
    let failedCount = 0
    let firstImage = true

    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]
      const imagePath = path.join(imageDir, name)
      writeNdjson(res, {
        type: 'progress',
        stage: 'processing',
        currentIndex: index + 1,
        totalCount: names.length,
        fileName: name,
        imagePath,
      })

      try {
        const imageDataUrl = await toImageDataUrl(imagePath)
        const lookaheadName = index + 1 < names.length ? names[index + 1] : ''
        const lookaheadImagePath = lookaheadName ? path.join(imageDir, lookaheadName) : ''
        const lookaheadImageDataUrl = lookaheadImagePath ? await toImageDataUrl(lookaheadImagePath) : ''
        const result = await runWithArkApiKey(arkApiKey, () =>
          processChapterSessionImage({
            sessionId,
            imageDataUrl,
            imageLabel: name,
            lookaheadImageDataUrl,
            lookaheadImageLabel: lookaheadName,
            overrideChapterTitle: firstImage ? overrideChapterTitle : '',
            overrideSectionTitle: firstImage ? overrideSectionTitle : '',
          }),
        )
        firstImage = false
        successCount += 1
        const item = {
          fileName: name,
          imagePath,
          status: 'success',
          currentIndex: index + 1,
          totalCount: names.length,
          currentChapterTitle: result.currentChapterTitle,
          currentSectionTitle: result.currentSectionTitle,
          question: result.question,
        }
        results.push(item)
        writeNdjson(res, {
          type: 'result',
          ...item,
        })
      } catch (error) {
        failedCount += 1
        const msg = error instanceof Error ? error.message : String(error)
        await appendAutoProcessFailureLog({
          sessionId,
          imagePath,
          error: msg,
        })
        const item = {
          fileName: name,
          imagePath,
          status: 'failed',
          currentIndex: index + 1,
          totalCount: names.length,
          error: msg,
        }
        results.push(item)
        writeNdjson(res, {
          type: 'result',
          ...item,
        })
      }
    }

    const latestSession = await getChapterSession(sessionId)
    const latestQuestionSession = await getQuestionSession(sessionId)
    writeNdjson(res, {
      type: 'done',
      sessionId,
      imageDir,
      slotRelativePath: imageTarget.slotRelativePath,
      totalCount: names.length,
      successCount,
      failedCount,
      currentChapterTitle: latestSession?.currentChapterTitle || '',
      currentSectionTitle: latestSession?.currentSectionTitle || '',
      pending: (latestQuestionSession?.pendingPageDataUrls || []).length > 0,
      pendingContinueQuestionKey: latestQuestionSession?.pendingContinueQuestionKey || null,
      failureLogPath: path.join(READ_RESULTS_DIR, 'auto_process_failures.jsonl'),
      results,
    })
    return res.end()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (!streamStarted) {
      return res.status(500).json({ message: `Auto run failed: ${msg}` })
    }
    writeNdjson(res, {
      type: 'error',
      message: `Auto run failed: ${msg}`,
    })
    return res.end()
  }
})

export function registerChapterSessionRoutes(app: Router) {
  app.use(router)
}
