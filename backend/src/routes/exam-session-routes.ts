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
  batchId,
  ensureDir,
  isSupportedImageFileName,
  sanitizeFileName,
  sanitizeFolderName,
  sortImageFileNames,
  toImageDataUrl,
  toImageDataUrlFromFile,
  writeNdjson,
} from '../question-bank-service'
import { convertPdfToImages, listConvertedFilesByPrefix } from '../pdf-convert-service'
import { cleanupUploadedFiles, upload } from '../upload'
import { ensureWorkspace, resolveManagedJsonInput } from '../workspace-store'

const router = Router()

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

type ExamAutoSourceItem = {
  fileName: string
  imagePath?: string
  uploadFile?: Express.Multer.File
}

function getOrderedUploadSourceFiles(filesRaw: unknown) {
  if (!Array.isArray(filesRaw)) {
    return []
  }

  const files = filesRaw as Express.Multer.File[]
  const ordered = files
    .map((file, arrivalIndex) => {
      const match = String(file.fieldname || '').match(/^source_(\d+)$/i)
      if (!match) {
        return null
      }
      return {
        order: Number(match[1]),
        arrivalIndex,
        file,
      }
    })
    .filter((item): item is { order: number, arrivalIndex: number, file: Express.Multer.File } => Boolean(item))
    .sort((a, b) => a.order - b.order || a.arrivalIndex - b.arrivalIndex)

  if (ordered.length) {
    return ordered.map((item) => item.file)
  }

  return files
}

function detectUploadedSourceKind(files: Express.Multer.File[]) {
  let hasImage = false
  let hasPdf = false

  for (const file of files) {
    const name = String(file?.originalname || '').trim()
    if (/\.(png|jpe?g|webp)$/i.test(name)) {
      hasImage = true
      continue
    }
    if (/\.pdf$/i.test(name)) {
      hasPdf = true
      continue
    }
    return 'unsupported'
  }

  if (hasImage && hasPdf) return 'mixed'
  if (hasPdf) return 'pdf'
  if (hasImage) return 'image'
  return ''
}

async function loadExamAutoSourceDataUrl(source: ExamAutoSourceItem) {
  if (source.imagePath) {
    return await toImageDataUrl(source.imagePath)
  }
  if (source.uploadFile) {
    return await toImageDataUrlFromFile(source.uploadFile)
  }
  throw new Error(`No readable image source for ${source.fileName}`)
}

async function buildExamAutoSourcesFromDirectory(imageDir: string) {
  const names = sortImageFileNames((await fsp.readdir(imageDir)).filter((name) => isSupportedImageFileName(name)))
  return names.map((name) => ({
    fileName: name,
    imagePath: path.join(imageDir, name),
  })) as ExamAutoSourceItem[]
}

async function buildExamAutoSourcesFromUploads(params: {
  files: Express.Multer.File[]
  workspaceId?: string
  folderName?: string
}) {
  const files = Array.isArray(params.files) ? params.files.filter((file) => Number(file?.size) > 0) : []
  if (!files.length) {
    throw new Error('source files are required')
  }

  const sourceKind = detectUploadedSourceKind(files)
  if (sourceKind === 'mixed') {
    throw new Error('mixed image and PDF uploads are not supported in the same batch')
  }
  if (sourceKind === 'unsupported' || !sourceKind) {
    throw new Error('only image and PDF files are supported')
  }

  if (sourceKind === 'image') {
    return {
      sourceKind,
      workspaceId: String(params.workspaceId || '').trim(),
      outputFolder: '',
      sources: files.map((file, index) => ({
        fileName: file.originalname || `image_${index + 1}`,
        uploadFile: file,
      })) as ExamAutoSourceItem[],
    }
  }

  const folderToken = sanitizeFolderName(String(params.folderName || '').trim()) || `exam_auto_${batchId()}`
  const workspace = await ensureWorkspace({
    workspaceId: params.workspaceId,
    name: folderToken,
  })
  const outputRelativeDir = path.posix.join('output_images', folderToken)
  const outputDir = path.join(workspace.workspaceDir, outputRelativeDir)
  ensureDir(outputDir)
  const existingItems = await fsp.readdir(outputDir).catch(() => [])
  await Promise.all(existingItems.map((item) => fsp.rm(path.join(outputDir, item), { recursive: true, force: true })))

  const sources: ExamAutoSourceItem[] = []
  let nextPageNo = 1

  for (let index = 0; index < files.length; index += 1) {
    const pdfFile = files[index]
    const originalName = pdfFile.originalname || `exam_${index + 1}.pdf`
    if (!/\.pdf$/i.test(originalName)) {
      throw new Error(`only .pdf files are supported: ${originalName}`)
    }

    const safeStem = sanitizeFileName(path.basename(originalName, path.extname(originalName))) || `exam_${index + 1}`
    const outputPrefix = `part_${String(index + 1).padStart(2, '0')}_${safeStem}`

    await convertPdfToImages({
      filePath: pdfFile.path,
      outputDir,
      outputPrefix,
    })

    const convertedFiles = await listConvertedFilesByPrefix(outputDir, outputPrefix)
    if (!convertedFiles.length) {
      throw new Error(`No pages were generated for ${originalName}`)
    }

    for (let pageIndex = 0; pageIndex < convertedFiles.length; pageIndex += 1) {
      const fileName = convertedFiles[pageIndex]
      const pageNo = nextPageNo
      nextPageNo += 1
      const normalizedFileName = `${pageNo}.jpg`
      const fromPath = path.join(outputDir, fileName)
      const toPath = path.join(outputDir, normalizedFileName)
      if (fromPath !== toPath) {
        await fsp.rm(toPath, { force: true })
        await fsp.rename(fromPath, toPath)
      }
      sources.push({
        fileName: normalizedFileName,
        imagePath: toPath,
      })
    }
  }

  return {
    sourceKind,
    workspaceId: workspace.workspaceId,
    outputFolder: outputDir,
    sources,
  }
}

async function streamExamAutoRun(params: {
  req: Request
  res: Response
  sessionId: string
  sources: ExamAutoSourceItem[]
}) {
  const { req, res, sessionId, sources } = params
  writeNdjson(res, {
    type: 'start',
    totalCount: sources.length,
  })

  for (let index = 0; index < sources.length; index += 1) {
    const current = sources[index]
    const lookahead = sources[index + 1] || null

    try {
      const result = await runWithArkApiKey(getArkApiKeyFromRequest(req), async () =>
        processExamSessionImage({
          sessionId,
          imageDataUrl: await loadExamAutoSourceDataUrl(current),
          imageLabel: current.fileName,
          lookaheadImageDataUrl: lookahead ? await loadExamAutoSourceDataUrl(lookahead) : '',
          lookaheadImageLabel: lookahead?.fileName || '',
        }),
      )
      writeNdjson(res, {
        type: 'result',
        status: 'success',
        currentIndex: index + 1,
        totalCount: sources.length,
        fileName: current.fileName,
        result,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      writeNdjson(res, {
        type: 'result',
        status: 'failed',
        currentIndex: index + 1,
        totalCount: sources.length,
        fileName: current.fileName,
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

  const sources = await buildExamAutoSourcesFromDirectory(imageDir)
  if (!sources.length) {
    return res.status(400).json({ message: 'no image files found in imageDir' })
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders?.()

  try {
    await streamExamAutoRun({
      req,
      res,
      sessionId,
      sources,
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

router.post('/api/exams/session/auto-run-upload-stream', upload.any(), async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '').trim()
  const workspaceIdInput = String(req.body?.workspaceId || '').trim()
  const folderNameInput = String(req.body?.folderName || '').trim()

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' })
  }
  if (!(await getExamSession(sessionId))) {
    return res.status(404).json({ message: 'session not found, please init first' })
  }

  const files = getOrderedUploadSourceFiles(req.files).filter((file) => Number(file?.size) > 0)
  if (!files.length) {
    return res.status(400).json({ message: 'source files are required' })
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders?.()

  try {
    const prepared = await buildExamAutoSourcesFromUploads({
      files,
      workspaceId: workspaceIdInput,
      folderName: folderNameInput,
    })

    writeNdjson(res, {
      type: 'source-ready',
      sourceKind: prepared.sourceKind,
      totalCount: prepared.sources.length,
      workspaceId: prepared.workspaceId,
      outputFolder: prepared.outputFolder,
    })

    await streamExamAutoRun({
      req,
      res,
      sessionId,
      sources: prepared.sources,
    })
    res.end()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    writeNdjson(res, {
      type: 'fatal',
      error: msg,
    })
    res.end()
  } finally {
    await cleanupUploadedFiles(req)
  }
})

export function registerExamSessionRoutes(app: Router) {
  app.use(router)
}
