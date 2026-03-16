import { Router, type Request, type Response } from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { ARK_MODEL } from '../config'
import { readByDoubao, resolveOutputImagePath, saveReadTextFile, toImageDataUrl, toImageDataUrlFromFile } from '../question-bank-service'
import { upload } from '../upload'

const router = Router()

router.post('/api/doubao/read', async (req: Request, res: Response) => {
  try {
    const imageUrlsRaw = req.body?.imageUrls
    if (!Array.isArray(imageUrlsRaw) || imageUrlsRaw.length === 0) {
      return res.status(400).json({ message: 'imageUrls is required' })
    }
    if (imageUrlsRaw.length > 20) {
      return res.status(400).json({ message: 'At most 20 images per request' })
    }

    const imageUrls = imageUrlsRaw
      .map((item) => String(item || '').trim())
      .filter((item, index, arr) => item && arr.indexOf(item) === index)

    if (!imageUrls.length) {
      return res.status(400).json({ message: 'imageUrls is empty' })
    }

    const imagePaths = imageUrls.map(resolveOutputImagePath)
    if (imagePaths.some((item) => !item)) {
      return res.status(400).json({ message: 'Invalid image url in imageUrls' })
    }

    for (const imagePath of imagePaths) {
      await fsp.access(imagePath)
    }

    const dataUrls = await Promise.all(imagePaths.map((item) => toImageDataUrl(item)))
    const text = await readByDoubao(dataUrls)
    const hint = imagePaths.length ? path.basename(path.dirname(imagePaths[0])) : 'doubao_read'
    const saved = await saveReadTextFile(text, hint)

    return res.json({
      message: 'success',
      model: ARK_MODEL,
      imageCount: imageUrls.length,
      text,
      savedTextUrl: saved.url,
      savedTextFileName: saved.fileName,
      savedTextPath: saved.absolutePath,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Doubao read failed: ${msg}` })
  }
})

router.post('/api/doubao/read-files', upload.array('images', 20), async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (!files.length) {
      return res.status(400).json({ message: 'images is required' })
    }

    const dataUrls = files.map((file) => toImageDataUrlFromFile(file))
    const text = await readByDoubao(dataUrls)
    const saved = await saveReadTextFile(text, 'upload_read')

    return res.json({
      message: 'success',
      model: ARK_MODEL,
      imageCount: files.length,
      text,
      savedTextUrl: saved.url,
      savedTextFileName: saved.fileName,
      savedTextPath: saved.absolutePath,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ message: `Doubao read failed: ${msg}` })
  }
})

export function registerReadRoutes(app: Router) {
  app.use(router)
}
