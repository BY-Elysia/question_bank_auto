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
  chapterSessions,
  ensureSectionChapter,
  ensureTopChapter,
  isSupportedImageFileName,
  loadTextbookJson,
  normalizeJsonPath,
  normalizeTitle,
  processChapterSessionImage,
  questionSessions,
  saveTextbookJson,
  sortImageFileNames,
  toImageDataUrl,
  toImageDataUrlFromFile,
  writeNdjson,
} from '../question-bank-service'
import { upload } from '../upload'

const router = Router()

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

router.post('/api/chapters/session/init', async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const currentChapterTitleRaw = String(req.body?.currentChapterTitle || '').trim()
    const currentSectionTitleRaw = String(req.body?.currentSectionTitle || '').trim()

    if (!jsonFilePathRaw) {
      return res.status(400).json({ message: 'jsonFilePath is required' })
    }
    if (!currentChapterTitleRaw || !currentSectionTitleRaw) {
      return res.status(400).json({ message: 'currentChapterTitle and currentSectionTitle are required' })
    }

    const jsonFilePath = normalizeJsonPath(jsonFilePathRaw)
    const fileStat = await fsp.stat(jsonFilePath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) {
      return res.status(400).json({ message: 'jsonFilePath does not exist or is not a file' })
    }

    const payload = await loadTextbookJson(jsonFilePath)
    const chapter = ensureTopChapter(payload, currentChapterTitleRaw)
    const section = ensureSectionChapter(payload, chapter.chapterId, currentSectionTitleRaw)
    await saveTextbookJson(jsonFilePath, payload)

    const sessionId = batchId()
    const chapterSession = {
      sessionId,
      jsonFilePath,
      currentChapterTitle: normalizeTitle(currentChapterTitleRaw),
      currentSectionTitle: normalizeTitle(currentSectionTitleRaw),
      updatedAt: new Date().toISOString(),
    }
    chapterSessions.set(sessionId, chapterSession)
    questionSessions.set(sessionId, {
      sessionId,
      jsonFilePath,
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
      jsonFilePath,
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
    if (!chapterSessions.get(sessionId)) {
      return res.status(404).json({ message: 'session not found, please init first' })
    }
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) || {}
    const imageFile = files.image?.[0]
    const lookaheadImageFile = files.lookaheadImage?.[0]
    if (!imageFile) {
      return res.status(400).json({ message: 'image file is required' })
    }
    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      processChapterSessionImage({
        sessionId,
        imageDataUrl: toImageDataUrlFromFile(imageFile),
        imageLabel: imageFile.originalname || '',
        lookaheadImageDataUrl: lookaheadImageFile ? toImageDataUrlFromFile(lookaheadImageFile) : '',
        lookaheadImageLabel: lookaheadImageFile?.originalname || '',
        overrideChapterTitle: String(req.body?.currentChapterTitle || '').trim(),
        overrideSectionTitle: String(req.body?.currentSectionTitle || '').trim(),
      }),
    )
    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Process chapter image failed: ${msg}` })
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
    if (!chapterSessions.get(sessionId)) {
      return res.status(404).json({ message: 'session not found, please init first' })
    }
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) || {}
    const imageFile = files.image?.[0]
    const lookaheadImageFile = files.lookaheadImage?.[0]
    if (!imageFile) {
      return res.status(400).json({ message: 'image file is required' })
    }
    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      processChapterSessionImageWithResponsesPrefixCache({
        sessionId,
        imageDataUrl: toImageDataUrlFromFile(imageFile),
        imageLabel: imageFile.originalname || '',
        lookaheadImageDataUrl: lookaheadImageFile ? toImageDataUrlFromFile(lookaheadImageFile) : '',
        lookaheadImageLabel: lookaheadImageFile?.originalname || '',
        overrideChapterTitle: String(req.body?.currentChapterTitle || '').trim(),
        overrideSectionTitle: String(req.body?.currentSectionTitle || '').trim(),
      }),
    )
    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Process chapter image with responses prefix cache failed: ${msg}` })
  }
})

router.post('/api/chapters/segments/append-from-images', upload.array('images', 40), async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const chapterTitle = String(req.body?.chapterTitle || '').trim()
    const sectionTitle = String(req.body?.sectionTitle || '').trim()
    if (!jsonFilePathRaw) {
      return res.status(400).json({ message: 'jsonFilePath is required' })
    }
    if (!chapterTitle || !sectionTitle) {
      return res.status(400).json({ message: 'chapterTitle and sectionTitle are required' })
    }

    const files = ((req.files as Express.Multer.File[] | undefined) || []).filter((file) => file?.buffer?.length)
    if (!files.length) {
      return res.status(400).json({ message: 'images are required' })
    }

    const jsonFilePath = normalizeJsonPath(jsonFilePathRaw)
    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      appendChapterSegmentFromImages({
        jsonFilePath,
        chapterTitle,
        sectionTitle,
        imageDataUrls: files.map((file) => toImageDataUrlFromFile(file)),
        imageLabels: files.map((file) => file.originalname || ''),
      }),
    )
    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Append chapter segment from images failed: ${msg}` })
  }
})

router.post('/api/chapters/segments/append-from-images-responses', upload.array('images', 40), async (req: Request, res: Response) => {
  try {
    const jsonFilePathRaw = String(req.body?.jsonFilePath || '').trim()
    const chapterTitle = String(req.body?.chapterTitle || '').trim()
    const sectionTitle = String(req.body?.sectionTitle || '').trim()
    if (!jsonFilePathRaw) {
      return res.status(400).json({ message: 'jsonFilePath is required' })
    }
    if (!chapterTitle || !sectionTitle) {
      return res.status(400).json({ message: 'chapterTitle and sectionTitle are required' })
    }

    const files = ((req.files as Express.Multer.File[] | undefined) || []).filter((file) => file?.buffer?.length)
    if (!files.length) {
      return res.status(400).json({ message: 'images are required' })
    }

    const jsonFilePath = normalizeJsonPath(jsonFilePathRaw)
    const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), () =>
      appendChapterSegmentFromImagesWithResponsesPrefixCache({
        jsonFilePath,
        chapterTitle,
        sectionTitle,
        imageDataUrls: files.map((file) => toImageDataUrlFromFile(file)),
        imageLabels: files.map((file) => file.originalname || ''),
      }),
    )
    return res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Append chapter segment from images with responses prefix cache failed: ${msg}` })
  }
})

router.post('/api/chapters/session/auto-run', async (req: Request, res: Response) => {
  try {
    const arkApiKey = getArkApiKeyFromRequest(req)
    const sessionId = String(req.body?.sessionId || '').trim()
    const imageDirRaw = String(req.body?.imageDir || '').trim()
    const overrideChapterTitle = String(req.body?.currentChapterTitle || '').trim()
    const overrideSectionTitle = String(req.body?.currentSectionTitle || '').trim()

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!imageDirRaw) {
      return res.status(400).json({ message: 'imageDir is required' })
    }
    if (!chapterSessions.get(sessionId)) {
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

    const latestSession = chapterSessions.get(sessionId)
    const latestQuestionSession = questionSessions.get(sessionId)
    return res.json({
      message: 'success',
      sessionId,
      imageDir,
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
    const imageDirRaw = String(req.body?.imageDir || '').trim()
    const overrideChapterTitle = String(req.body?.currentChapterTitle || '').trim()
    const overrideSectionTitle = String(req.body?.currentSectionTitle || '').trim()

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!imageDirRaw) {
      return res.status(400).json({ message: 'imageDir is required' })
    }
    if (!chapterSessions.get(sessionId)) {
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
    res.setHeader('Connection', 'keep-alive')
    streamStarted = true
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders()
    }

    writeNdjson(res, {
      type: 'start',
      sessionId,
      imageDir,
      totalCount: names.length,
      currentChapterTitle: overrideChapterTitle || chapterSessions.get(sessionId)?.currentChapterTitle || '',
      currentSectionTitle: overrideSectionTitle || chapterSessions.get(sessionId)?.currentSectionTitle || '',
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

    const latestSession = chapterSessions.get(sessionId)
    const latestQuestionSession = questionSessions.get(sessionId)
    writeNdjson(res, {
      type: 'done',
      sessionId,
      imageDir,
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
    const sessionId = String(req.body?.sessionId || '').trim()
    const imageDirRaw = String(req.body?.imageDir || '').trim()
    const overrideChapterTitle = String(req.body?.currentChapterTitle || '').trim()
    const overrideSectionTitle = String(req.body?.currentSectionTitle || '').trim()

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' })
    }
    if (!imageDirRaw) {
      return res.status(400).json({ message: 'imageDir is required' })
    }
    if (!chapterSessions.get(sessionId)) {
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
    res.setHeader('Connection', 'keep-alive')
    streamStarted = true
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders()
    }

    writeNdjson(res, {
      type: 'start',
      sessionId,
      imageDir,
      totalCount: names.length,
      currentChapterTitle: overrideChapterTitle || chapterSessions.get(sessionId)?.currentChapterTitle || '',
      currentSectionTitle: overrideSectionTitle || chapterSessions.get(sessionId)?.currentSectionTitle || '',
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
        const result = await processChapterSessionImage({
          sessionId,
          imageDataUrl,
          imageLabel: name,
          lookaheadImageDataUrl,
          lookaheadImageLabel: lookaheadName,
          overrideChapterTitle: firstImage ? overrideChapterTitle : '',
          overrideSectionTitle: firstImage ? overrideSectionTitle : '',
        })
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

    const latestSession = chapterSessions.get(sessionId)
    const latestQuestionSession = questionSessions.get(sessionId)
    writeNdjson(res, {
      type: 'done',
      sessionId,
      imageDir,
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
