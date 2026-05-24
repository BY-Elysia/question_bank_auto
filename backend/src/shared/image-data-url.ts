import fsp from 'node:fs/promises'
import path from 'node:path'
import { readUploadedFileBuffer } from '../upload'

function getImageMimeByPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return ''
}

function getImageMimeByFile(file: Express.Multer.File) {
  const fromMime = String(file.mimetype || '').toLowerCase()
  if (fromMime === 'image/png' || fromMime === 'image/webp' || fromMime === 'image/jpeg') {
    return fromMime
  }
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return ''
}

export async function toImageDataUrl(imagePath: string) {
  const mime = getImageMimeByPath(imagePath)
  if (!mime) {
    throw new Error(`Unsupported image type: ${imagePath}`)
  }
  const bytes = await fsp.readFile(imagePath)
  return `data:${mime};base64,${bytes.toString('base64')}`
}

export async function toImageDataUrlFromFile(file: Express.Multer.File) {
  const mime = getImageMimeByFile(file)
  if (!mime) {
    throw new Error(`Unsupported image file: ${file.originalname || 'unknown'}`)
  }
  const bytes = await readUploadedFileBuffer(file)
  return `data:${mime};base64,${bytes.toString('base64')}`
}
