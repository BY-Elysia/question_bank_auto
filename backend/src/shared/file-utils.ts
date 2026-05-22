import fs from 'node:fs'
import path from 'node:path'

export function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function sanitizeFolderName(name: string) {
  return name
    .replace(/[^\p{L}\p{N}_-]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function batchId() {
  const now = new Date()
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const rand = Math.random().toString(16).slice(2, 10)
  return `${ts}_${rand}`
}

export function parsePageIndex(fileName: string) {
  const match = fileName.match(/(?:-|_)(\d+)\.(?:jpg|jpeg)$/i)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

export function normalizeJsonFileName(fileName: string) {
  const safe = sanitizeFileName(path.basename(fileName || ''))
  const finalName = safe || `textbook_${batchId()}`
  return finalName.toLowerCase().endsWith('.json') ? finalName : `${finalName}.json`
}

export function isSupportedImageFileName(fileName: string) {
  return /\.(jpg|jpeg|png|webp)$/i.test(fileName)
}

export function sortImageFileNames(fileNames: string[]) {
  return [...fileNames].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' }))
}
