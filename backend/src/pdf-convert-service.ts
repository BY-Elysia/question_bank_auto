import { execFile } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { JPEG_QUALITY, PDF_RENDER_DPI } from './config'
import { parsePageIndex } from './question-bank-service'

const execFileAsync = promisify(execFile)
let cachedPdftocairoBinary = ''

async function statFile(targetPath: string) {
  return await fsp.stat(targetPath).catch(() => null)
}

async function findPdftocairoInWindowsLocations() {
  const staticCandidates = [
    'C:\\poppler\\Library\\bin\\pdftocairo.exe',
    'C:\\Program Files\\poppler\\Library\\bin\\pdftocairo.exe',
    'C:\\Program Files\\poppler\\bin\\pdftocairo.exe',
  ]

  const localAppData = String(process.env.LOCALAPPDATA || '').trim()
  if (localAppData) {
    const wingetPackagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
    const packageDirs = await fsp.readdir(wingetPackagesDir, { withFileTypes: true }).catch(() => [])
    for (const entry of packageDirs) {
      if (!entry.isDirectory() || !entry.name.startsWith('oschwartz10612.Poppler')) {
        continue
      }
      const packageRoot = path.join(wingetPackagesDir, entry.name)
      const extractedDirs = await fsp.readdir(packageRoot, { withFileTypes: true }).catch(() => [])
      for (const extracted of extractedDirs) {
        if (!extracted.isDirectory() || !extracted.name.startsWith('poppler-')) {
          continue
        }
        staticCandidates.push(path.join(packageRoot, extracted.name, 'Library', 'bin', 'pdftocairo.exe'))
        staticCandidates.push(path.join(packageRoot, extracted.name, 'bin', 'pdftocairo.exe'))
      }
    }
  }

  for (const candidate of staticCandidates) {
    const stat = await statFile(candidate)
    if (stat?.isFile()) {
      return candidate
    }
  }

  return ''
}

async function resolvePdftocairoBinary() {
  if (cachedPdftocairoBinary) {
    return cachedPdftocairoBinary
  }

  if (process.platform === 'win32') {
    const discovered = await findPdftocairoInWindowsLocations()
    if (discovered) {
      cachedPdftocairoBinary = discovered
      return discovered
    }
  }

  cachedPdftocairoBinary = 'pdftocairo'
  return cachedPdftocairoBinary
}

function buildPdfToolMissingMessage() {
  if (process.platform === 'win32') {
    return [
      'pdftocairo 未安装或不在 PATH 中。',
      '请安装 Poppler for Windows，并把其 bin 目录加入 PATH。',
      '常见形式类似：C:\\poppler\\Library\\bin 或 C:\\Program Files\\poppler\\bin。',
      '安装完成后请重启 backend 服务。',
    ].join(' ')
  }
  return [
    'pdftocairo 未安装或不在 PATH 中。',
    '请先安装 Poppler 工具集（Ubuntu/Debian 可执行：sudo apt install -y poppler-utils）。',
    '安装完成后请重启 backend 服务。',
  ].join(' ')
}

export async function listConvertedFilesByPrefix(outputDir: string, prefix: string) {
  return (await fsp.readdir(outputDir))
    .filter((item) => item.startsWith(`${prefix}-`) && /\.(jpg|jpeg)$/i.test(item))
    .sort((a, b) => parsePageIndex(a) - parsePageIndex(b) || a.localeCompare(b))
}

export async function convertPdfToImages(params: {
  filePath: string
  outputDir: string
  outputPrefix: string
}) {
  const { filePath, outputDir, outputPrefix } = params
  const pdftocairoBinary = await resolvePdftocairoBinary()
  try {
    await execFileAsync(pdftocairoBinary, [
      '-jpeg',
      '-jpegopt',
      `quality=${JPEG_QUALITY}`,
      '-r',
      String(PDF_RENDER_DPI),
      filePath,
      path.join(outputDir, outputPrefix),
    ])
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new Error(buildPdfToolMissingMessage())
    }
    throw error
  }
}
