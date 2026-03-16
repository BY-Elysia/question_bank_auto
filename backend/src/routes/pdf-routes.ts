import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import pdfPoppler from 'pdf-poppler'
import { JPEG_QUALITY, OUTPUT_DIR, PDF_RENDER_DPI, UPLOAD_DIR } from '../config'
import { batchId, ensureDir, parsePageIndex, sanitizeFileName, sanitizeFolderName } from '../question-bank-service'
import { upload } from '../upload'

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

async function listConvertedFilesByPrefix(outputDir: string, prefix: string) {
  return (await fsp.readdir(outputDir))
    .filter((item) => item.startsWith(`${prefix}-`) && /\.(jpg|jpeg)$/i.test(item))
    .sort((a, b) => parsePageIndex(a) - parsePageIndex(b) || a.localeCompare(b))
}

router.post('/api/convert', upload.any(), async (req: Request, res: Response) => {
  try {
    const pdfFiles = getOrderedPdfFiles(req.files)
    if (!pdfFiles.length) {
      return res.status(400).json({ message: 'Missing file field: pdf/pdfs/pdf_<index>' })
    }

    const rawFolderName = String(req.body?.folderName ?? '').trim()
    const folderName = sanitizeFolderName(rawFolderName)
    if (!folderName) {
      return res.status(400).json({ message: 'folderName is required' })
    }

    const id = batchId()
    const batchOutputDir = path.join(OUTPUT_DIR, folderName)
    ensureDir(batchOutputDir)
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
      const originalName = pdfFile.originalname || `textbook_${index + 1}.pdf`
      const ext = path.extname(originalName).toLowerCase()
      if (ext !== '.pdf') {
        return res.status(400).json({ message: `Only .pdf files are supported: ${originalName}` })
      }

      const safeOriginal = sanitizeFileName(path.basename(originalName)) || `textbook_${index + 1}.pdf`
      const safeStem = sanitizeFileName(path.basename(originalName, ext)) || `textbook_${index + 1}`
      const savedPdfName = `${id}_${String(index + 1).padStart(2, '0')}_${safeOriginal}`
      const savedPdfPath = path.join(UPLOAD_DIR, savedPdfName)
      await fsp.writeFile(savedPdfPath, pdfFile.buffer)
      savedPdfs.push({
        order: index + 1,
        originalName,
        savedPdf: `/uploads/${savedPdfName}`,
      })

      const outPrefix = `part_${String(index + 1).padStart(2, '0')}_${safeStem}`
      await pdfPoppler.convert(savedPdfPath, {
        format: 'jpeg',
        out_dir: batchOutputDir,
        out_prefix: outPrefix,
        page: null,
        dpi: PDF_RENDER_DPI,
        jpegFile: true,
        jpegQuality: JPEG_QUALITY,
      })

      const convertedFiles = await listConvertedFilesByPrefix(batchOutputDir, outPrefix)
      if (!convertedFiles.length) {
        throw new Error(`No pages were generated for ${originalName}`)
      }

      for (let pageIndex = 0; pageIndex < convertedFiles.length; pageIndex += 1) {
        const fileName = convertedFiles[pageIndex]
        const pageNo = nextPageNo
        nextPageNo += 1
        const newFileName = `${pageNo}.jpg`
        const fromPath = path.join(batchOutputDir, fileName)
        const toPath = path.join(batchOutputDir, newFileName)
        if (fromPath !== toPath) {
          await fsp.rm(toPath, { force: true })
          await fsp.rename(fromPath, toPath)
        }
        pages.push({
          page: pageNo,
          filename: newFileName,
          url: `/output_images/${folderName}/${newFileName}`,
          sourcePdfName: originalName,
          sourcePdfIndex: index + 1,
          sourcePage: pageIndex + 1,
        })
      }
    }

    return res.json({
      message: 'success',
      batchId: id,
      folderName,
      savedPdf: savedPdfs[0]?.savedPdf || '',
      savedPdfs,
      pdfCount: pdfFiles.length,
      pages,
      totalPages: pages.length,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `PDF conversion failed: ${msg}` })
  }
})

export function registerPdfRoutes(app: Router) {
  app.use(router)
}
