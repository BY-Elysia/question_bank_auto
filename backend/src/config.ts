import path from 'node:path'

export const APP_ROOT = path.resolve(__dirname, '..', '..')
export const FRONTEND_DIST_DIR = path.join(APP_ROOT, 'frontend', 'dist')
export const UPLOAD_DIR = path.join(APP_ROOT, 'uploads')
export const QUESTION_MEDIA_DIR = path.join(UPLOAD_DIR, 'question_media')
export const OUTPUT_DIR = path.join(APP_ROOT, 'output_images')
export const OUTPUT_JSON_DIR = path.join(APP_ROOT, 'output_json')
export const REPAIR_JSON_DIR = path.join(APP_ROOT, 'repair_json')
export const MERGED_JSON_DIR = path.join(APP_ROOT, 'merged_json')
export const READ_RESULTS_DIR = path.join(APP_ROOT, 'read_results')

export const PORT = Number(process.env.PORT || 5001)
export const PDF_RENDER_DPI = Number(process.env.PDF_RENDER_DPI || 180)
export const JPEG_QUALITY = Number(process.env.PDF_JPEG_QUALITY || 90)
export const ARK_API_KEY = String(process.env.ARK_API_KEY || '').trim()
export const ARK_BASE_URL = String(
  process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
).replace(/\/+$/g, '')
export const ARK_MODEL = String(process.env.ARK_MODEL || 'doubao-seed-2-0-pro-260215').trim()
export const ARK_TIMEOUT_MS = Number(process.env.ARK_TIMEOUT_MS || 300000)
export const ARK_RETRY_TIMES = Number(process.env.ARK_RETRY_TIMES || 3)
export const ARK_RETRY_DELAY_MS = Number(process.env.ARK_RETRY_DELAY_MS || 1200)
export const MAX_PENDING_QUEUE_PAGES = Number(process.env.MAX_PENDING_QUEUE_PAGES || 6)
export const QUESTION_BANK_DATABASE_URL = String(
  process.env.QUESTION_BANK_DATABASE_URL || process.env.DATABASE_URL || '',
).trim()
export const QUESTION_BANK_DB_SCHEMA = String(
  process.env.QUESTION_BANK_DB_SCHEMA || 'question_bank_auto',
).trim()
