import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { batchId, ensureDir, sanitizeFolderName } from '../question-bank-service'
import { convertPdfToImages, listConvertedFilesByPrefix } from '../pdf-convert-service'
import { cleanupUploadedFiles, normalizeUploadedOriginalName, upload } from '../upload'
import { ensureWorkspace, registerWorkspaceAsset, writeWorkspaceBinaryAsset } from '../workspace-store'

const router = Router()

function getOrderedPdfFiles(filesRaw: unknown) {
  if (!Array.isArray(filesRaw)) {
    return []
  }

  const files = filesRaw as Express.Multer.File[]
  const ordered = files
    .map((file, arrivalIndex) => {
      const match = file.fieldname.match(/^pdf_(\d+)$/i)
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

  return files.filter((file) => /^(pdf|pdfs)$/i.test(file.fieldname))
}

router.post('/api/convert', upload.any(), async (req: Request, res: Response) => {
  let conversionTempDir = ''
  try {
    const pdfFiles = getOrderedPdfFiles(req.files)
    if (!pdfFiles.length) {
      return res.status(400).json({ message: 'Missing file field: pdf/pdfs/pdf_<index>' })
    }

    const rawFolderName = String(req.body?.folderName ?? '').trim()
    const folderName = sanitizeFolderName(rawFolderName)
    const workspaceIdInput = String(req.body?.workspaceId || '').trim()
    if (!folderName) {
      return res.status(400).json({ message: 'folderName is required' })
    }
    if (!workspaceIdInput) {
      return res.status(400).json({ message: 'workspaceId is required; please create and select a workspace first' })
    }

    const id = batchId()
    const workspace = await ensureWorkspace({
      workspaceId: workspaceIdInput,
      name: folderName,
    })
    const batchOutputRelativeDir = path.posix.join('output_images', folderName)
    const batchOutputDir = path.join(workspace.workspaceDir, batchOutputRelativeDir)
    conversionTempDir = path.join(workspace.workspaceDir, 'output_images', `_pdf_convert_${id}`)
    ensureDir(batchOutputDir)
    ensureDir(conversionTempDir)
    const existingItems = await fsp.readdir(batchOutputDir).catch(() => [])
    await Promise.all(
      existingItems.map((item) =>
        fsp.rm(path.join(batchOutputDir, item), { recursive: true, force: true }),
      ),
    )

    const savedPdfs: Array<{
      order: number
      originalName: string
      savedPdf: string
      pdfAssetId: string
    }> = []
    const pages: Array<{
      page: number
      filename: string
      url: string
      sourcePdfName: string
      sourcePdfIndex: number
      sourcePage: number
    }> = []
    let nextPageNo = 1

    for (let index = 0; index < pdfFiles.length; index += 1) {
      const pdfFile = pdfFiles[index]
      const originalName = normalizeUploadedOriginalName(pdfFile.originalname || '') || `textbook_${index + 1}.pdf`
      const ext = path.extname(originalName).toLowerCase()
      if (ext !== '.pdf') {
        return res.status(400).json({ message: `Only .pdf files are supported: ${originalName}` })
      }

      const savedPdfName = `${id}_${String(index + 1).padStart(2, '0')}.pdf`
      const savedPdf = await writeWorkspaceBinaryAsset({
        workspaceId: workspace.workspaceId,
        fileName: savedPdfName,
        sourceFilePath: pdfFile.path,
        type: 'pdf',
        relativeDir: 'uploads',
        meta: {
          originalName,
          order: index + 1,
        },
      })
      savedPdfs.push({
        order: index + 1,
        originalName,
        savedPdf: savedPdf.publicUrl,
        pdfAssetId: savedPdf.asset.assetId,
      })

      const outPrefix = `part_${String(index + 1).padStart(2, '0')}`
      await convertPdfToImages({
        filePath: savedPdf.filePath,
        outputDir: conversionTempDir,
        outputPrefix: outPrefix,
      })

      const convertedFiles = await listConvertedFilesByPrefix(conversionTempDir, outPrefix)
      if (!convertedFiles.length) {
        throw new Error(`No pages were generated for ${originalName}`)
      }

      for (let pageIndex = 0; pageIndex < convertedFiles.length; pageIndex += 1) {
        const fileName = convertedFiles[pageIndex]
        const pageNo = nextPageNo
        nextPageNo += 1
        const newFileName = `${pageNo}.jpg`
        const fromPath = path.join(conversionTempDir, fileName)
        const toPath = path.join(batchOutputDir, newFileName)
        if (fromPath !== toPath) {
          await fsp.rm(toPath, { force: true })
          await fsp.rename(fromPath, toPath)
        }
        pages.push({
          page: pageNo,
          filename: newFileName,
          url: `/workspace-assets/${workspace.workspaceId}/${batchOutputRelativeDir}/${newFileName}`,
          sourcePdfName: originalName,
          sourcePdfIndex: index + 1,
          sourcePage: pageIndex + 1,
        })
      }
    }

    const imageBatch = await registerWorkspaceAsset({
      workspaceId: workspace.workspaceId,
      type: 'image_batch',
      fileName: folderName,
      relativePath: batchOutputRelativeDir,
      assetId: `image_batch_${folderName}`,
      meta: {
        totalPages: pages.length,
        pdfCount: pdfFiles.length,
      },
    })

    return res.json({
      message: 'success',
      batchId: id,
      folderName,
      workspaceId: workspace.workspaceId,
      imageBatchAssetId: imageBatch.asset.assetId,
      outputFolder: batchOutputDir,
      savedPdf: savedPdfs[0]?.savedPdf || '',
      savedPdfs,
      pdfCount: pdfFiles.length,
      pages,
      totalPages: pages.length,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `PDF conversion failed: ${msg}` })
  } finally {
    if (conversionTempDir) {
      await fsp.rm(conversionTempDir, { recursive: true, force: true }).catch(() => undefined)
    }
    await cleanupUploadedFiles(req)
  }
})

export function registerPdfRoutes(app: Router) {
  app.use(router)
}
