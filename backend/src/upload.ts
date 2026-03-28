import fs from 'node:fs'
import fsp from 'node:fs/promises'
import type { Request } from 'express'
import multer from 'multer'
import { TEMP_UPLOAD_DIR } from './config'

fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true })

export const upload = multer({
  dest: TEMP_UPLOAD_DIR,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
})

export async function readUploadedFileBuffer(file: Express.Multer.File) {
  if (Buffer.isBuffer(file.buffer)) {
    return file.buffer
  }
  if (file.path) {
    return await fsp.readFile(file.path)
  }
  throw new Error(`Uploaded file ${file.originalname || 'unknown'} has no readable content`)
}

export async function readUploadedFileText(file: Express.Multer.File, encoding: BufferEncoding = 'utf8') {
  const buffer = await readUploadedFileBuffer(file)
  return buffer.toString(encoding)
}

function collectUploadedFiles(req: Request) {
  const files: Express.Multer.File[] = []
  if (req.file) {
    files.push(req.file)
  }
  if (Array.isArray(req.files)) {
    files.push(...req.files)
  } else if (req.files && typeof req.files === 'object') {
    for (const value of Object.values(req.files)) {
      if (Array.isArray(value)) {
        files.push(...value)
      }
    }
  }
  return files
}

export async function cleanupUploadedFiles(req: Request) {
  const tempPaths = Array.from(
    new Set(
      collectUploadedFiles(req)
        .map((file) => String(file?.path || '').trim())
        .filter(Boolean),
    ),
  )
  await Promise.all(tempPaths.map((filePath) => fsp.rm(filePath, { force: true }).catch(() => undefined)))
}
