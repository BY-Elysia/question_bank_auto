import fsp from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACES_DIR } from './config'
import { batchId, normalizeJsonFileName, sanitizeFileName } from './question-bank-service'

export type WorkspaceAssetType = 'json' | 'pdf' | 'image_batch'

type WorkspaceAssetRecord = {
  assetId: string
  type: WorkspaceAssetType
  fileName: string
  relativePath: string
  createdAt: string
  updatedAt: string
  meta?: Record<string, unknown>
}

type WorkspaceManifest = {
  workspaceId: string
  name: string
  createdAt: string
  updatedAt: string
  assets: WorkspaceAssetRecord[]
}

export type WorkspaceListItem = {
  workspaceId: string
  name: string
  createdAt: string
  updatedAt: string
  assetCount: number
  fileCount: number
  totalBytes: number
}

export type WorkspaceBrowserEntry = {
  name: string
  relativePath: string
  type: 'directory' | 'file'
  size: number
  modifiedAt: string
  extension: string
  childCount: number | null
}

export type MultiChapterSlotSummary = {
  slotName: string
  slotRelativePath: string
  slotAbsolutePath: string
  jsonFileName: string
  jsonRelativePath: string
  jsonFilePath: string
  imagesRelativePath: string
  imagesDirPath: string
  imageCount: number
  createdAt: string
  updatedAt: string
}

const MANIFEST_FILE_NAME = 'workspace.json'
const PRIMARY_JSON_ASSET_ID = 'json_main'
const PRIMARY_JSON_RELATIVE_PATH = 'output_json/main.json'
const MULTI_CHAPTER_ROOT_DIR = 'multi_chapter'
const SUMMARY_DIRS = ['output_json', 'uploads', 'output_images', 'read_results', MULTI_CHAPTER_ROOT_DIR] as const

function nowIso() {
  return new Date().toISOString()
}

function buildWorkspaceId() {
  return `ws_${batchId()}`
}

function normalizeWorkspaceName(name: string) {
  return sanitizeFileName(String(name || '').trim()) || 'workspace'
}

export function getWorkspaceDir(workspaceId: string) {
  return path.join(WORKSPACES_DIR, workspaceId)
}

function getWorkspaceManifestPath(workspaceId: string) {
  return path.join(getWorkspaceDir(workspaceId), MANIFEST_FILE_NAME)
}

function getWorkspaceRelativePath(relativePath: string) {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/g, '')
}

function normalizeMultiChapterSlotName(value: string | number) {
  const raw = String(value || '').trim()
  if (!/^\d+$/.test(raw)) {
    throw new Error('multi chapter slot name must be a positive integer')
  }
  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('multi chapter slot name must be a positive integer')
  }
  return String(Math.trunc(numeric))
}

export function getMultiChapterRootRelativePath() {
  return MULTI_CHAPTER_ROOT_DIR
}

export function getMultiChapterRootDir(workspaceId: string) {
  return path.join(getWorkspaceDir(workspaceId), MULTI_CHAPTER_ROOT_DIR)
}

export function getMultiChapterSlotRelativePath(slotName: string | number) {
  return path.posix.join(MULTI_CHAPTER_ROOT_DIR, normalizeMultiChapterSlotName(slotName))
}

function getMultiChapterSlotDir(workspaceId: string, slotName: string | number) {
  return path.join(getWorkspaceDir(workspaceId), MULTI_CHAPTER_ROOT_DIR, normalizeMultiChapterSlotName(slotName))
}

function getMultiChapterSlotJsonFileName(slotName: string | number) {
  return `${normalizeMultiChapterSlotName(slotName)}.json`
}

function getMultiChapterSlotJsonRelativePath(slotName: string | number) {
  return path.posix.join(getMultiChapterSlotRelativePath(slotName), getMultiChapterSlotJsonFileName(slotName))
}

function getMultiChapterSlotImagesRelativePath(slotName: string | number) {
  return path.posix.join(getMultiChapterSlotRelativePath(slotName), 'images')
}

function assertWorkspacePathInsideRoot(workspaceDir: string, targetPath: string) {
  const normalizedWorkspaceDir = path.resolve(workspaceDir)
  const normalizedTargetPath = path.resolve(targetPath)
  if (
    normalizedTargetPath !== normalizedWorkspaceDir &&
    !normalizedTargetPath.startsWith(`${normalizedWorkspaceDir}${path.sep}`)
  ) {
    throw new Error('workspace path is outside of the workspace root')
  }
}

async function statSafe(targetPath: string) {
  return await fsp.stat(targetPath).catch(() => null)
}

async function walkDirectoryUsage(targetPath: string): Promise<{ totalBytes: number, fileCount: number }> {
  const stat = await statSafe(targetPath)
  if (!stat) {
    return { totalBytes: 0, fileCount: 0 }
  }
  if (stat.isFile()) {
    return {
      totalBytes: stat.size,
      fileCount: 1,
    }
  }

  let totalBytes = 0
  let fileCount = 0
  const entries = await fsp.readdir(targetPath, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name)
    if (entry.isDirectory()) {
      const nested = await walkDirectoryUsage(entryPath)
      totalBytes += nested.totalBytes
      fileCount += nested.fileCount
      continue
    }
    if (entry.isFile()) {
      const nestedStat = await statSafe(entryPath)
      totalBytes += nestedStat?.size || 0
      fileCount += 1
    }
  }
  return {
    totalBytes,
    fileCount,
  }
}

async function ensureWorkspaceStructure(workspaceId: string) {
  const workspaceDir = getWorkspaceDir(workspaceId)
  await fsp.mkdir(path.join(workspaceDir, 'uploads'), { recursive: true })
  await fsp.mkdir(path.join(workspaceDir, 'output_images'), { recursive: true })
  await fsp.mkdir(path.join(workspaceDir, 'output_json'), { recursive: true })
  await fsp.mkdir(path.join(workspaceDir, 'read_results'), { recursive: true })
  return workspaceDir
}

async function loadWorkspaceManifest(workspaceId: string) {
  const manifestPath = getWorkspaceManifestPath(workspaceId)
  const text = await fsp.readFile(manifestPath, 'utf8')
  return JSON.parse(text) as WorkspaceManifest
}

async function saveWorkspaceManifest(manifest: WorkspaceManifest) {
  await ensureWorkspaceStructure(manifest.workspaceId)
  const manifestPath = getWorkspaceManifestPath(manifest.workspaceId)
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function getExistingWorkspace(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    throw new Error('workspaceId is required')
  }

  const manifestPath = getWorkspaceManifestPath(normalizedWorkspaceId)
  const manifestStat = await statSafe(manifestPath)
  if (!manifestStat?.isFile()) {
    throw new Error(`workspace ${normalizedWorkspaceId} not found`)
  }

  await ensureWorkspaceStructure(normalizedWorkspaceId)
  return {
    workspaceId: normalizedWorkspaceId,
    workspaceDir: getWorkspaceDir(normalizedWorkspaceId),
    manifest: await loadWorkspaceManifest(normalizedWorkspaceId),
  }
}

export async function ensureWorkspace(params?: { workspaceId?: string, name?: string }) {
  const workspaceId = String(params?.workspaceId || '').trim() || buildWorkspaceId()
  const manifestPath = getWorkspaceManifestPath(workspaceId)
  const existing = await fsp.stat(manifestPath).catch(() => null)
  if (existing?.isFile()) {
    const manifest = await loadWorkspaceManifest(workspaceId)
    await ensureWorkspaceStructure(workspaceId)
    return {
      workspaceId,
      workspaceDir: getWorkspaceDir(workspaceId),
      manifest,
    }
  }

  const createdAt = nowIso()
  const manifest: WorkspaceManifest = {
    workspaceId,
    name: normalizeWorkspaceName(params?.name || workspaceId),
    createdAt,
    updatedAt: createdAt,
    assets: [],
  }
  await saveWorkspaceManifest(manifest)
  return {
    workspaceId,
    workspaceDir: getWorkspaceDir(workspaceId),
    manifest,
  }
}

export async function getWorkspaceSummary(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    throw new Error('workspaceId is required')
  }

  const { manifest, workspaceDir } = await getExistingWorkspace(normalizedWorkspaceId)
  const topLevelStats = await Promise.all(
    SUMMARY_DIRS.map(async (dirName) => {
      const absolutePath = path.join(workspaceDir, dirName)
      const usage = await walkDirectoryUsage(absolutePath)
      return {
        dirName,
        ...usage,
      }
    }),
  )

  const totalBytes = topLevelStats.reduce((sum, item) => sum + item.totalBytes, 0)
  const fileCount = topLevelStats.reduce((sum, item) => sum + item.fileCount, 0)

  return {
    workspaceId: manifest.workspaceId,
    name: manifest.name,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    assetCount: Array.isArray(manifest.assets) ? manifest.assets.length : 0,
    fileCount,
    totalBytes,
    directories: Object.fromEntries(
      topLevelStats.map((item) => [
        item.dirName,
        {
          totalBytes: item.totalBytes,
          fileCount: item.fileCount,
        },
      ]),
    ),
  }
}

export async function listWorkspaces() {
  await fsp.mkdir(WORKSPACES_DIR, { recursive: true })
  const entries = await fsp.readdir(WORKSPACES_DIR, { withFileTypes: true }).catch(() => [])
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const summary = await getWorkspaceSummary(entry.name)
          return {
            workspaceId: summary.workspaceId,
            name: summary.name,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            assetCount: summary.assetCount,
            fileCount: summary.fileCount,
            totalBytes: summary.totalBytes,
          } satisfies WorkspaceListItem
        } catch (_error) {
          return null
        }
      }),
  )

  return items
    .filter((item): item is WorkspaceListItem => Boolean(item))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export async function createWorkspace(params?: {
  name?: string
}) {
  const workspace = await ensureWorkspace({
    name: params?.name,
  })
  return await getWorkspaceSummary(workspace.workspaceId)
}

export async function resolveWorkspaceEntry(params: {
  workspaceId: string
  relativePath?: string
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  const { manifest, workspaceDir } = await getExistingWorkspace(workspaceId)
  const relativePath = getWorkspaceRelativePath(params.relativePath || '')
  const targetPath = relativePath ? path.resolve(workspaceDir, relativePath) : workspaceDir
  assertWorkspacePathInsideRoot(workspaceDir, targetPath)

  const targetStat = await statSafe(targetPath)
  if (!targetStat) {
    throw new Error(`workspace path not found: ${relativePath || '.'}`)
  }

  return {
    workspaceId,
    workspaceDir,
    manifest,
    relativePath,
    targetPath,
    targetStat,
    isDirectory: targetStat.isDirectory(),
    isFile: targetStat.isFile(),
    name: relativePath ? path.basename(targetPath) : workspaceId,
  }
}

export async function browseWorkspaceDirectory(params: {
  workspaceId: string
  relativePath?: string
}) {
  const resolved = await resolveWorkspaceEntry(params)
  if (!resolved.isDirectory) {
    throw new Error(`workspace path is not a directory: ${resolved.relativePath || '.'}`)
  }

  const breadcrumbs = [
    {
      label: resolved.workspaceId,
      relativePath: '',
    },
  ]

  const segments = resolved.relativePath.split('/').filter(Boolean)
  let currentPath = ''
  for (const segment of segments) {
    currentPath = currentPath ? path.posix.join(currentPath, segment) : segment
    breadcrumbs.push({
      label: segment,
      relativePath: currentPath,
    })
  }

  const entries = await fsp.readdir(resolved.targetPath, { withFileTypes: true }).catch(() => [])
  const mappedEntries = await Promise.all(
    entries.map(async (entry) => {
      const entryRelativePath = resolved.relativePath
        ? path.posix.join(resolved.relativePath, entry.name)
        : entry.name
      const entryAbsolutePath = path.join(resolved.targetPath, entry.name)
      const entryStat = await statSafe(entryAbsolutePath)
      const childCount = entry.isDirectory()
        ? (await fsp.readdir(entryAbsolutePath, { withFileTypes: true }).catch(() => [])).length
        : null

      return {
        name: entry.name,
        relativePath: getWorkspaceRelativePath(entryRelativePath),
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entryStat?.isFile() ? entryStat.size : 0,
        modifiedAt: entryStat?.mtime ? entryStat.mtime.toISOString() : '',
        extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : '',
        childCount,
      } satisfies WorkspaceBrowserEntry
    }),
  )

  mappedEntries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  return {
    workspaceId: resolved.workspaceId,
    name: resolved.manifest.name,
    currentPath: resolved.relativePath,
    parentPath: resolved.relativePath.includes('/')
      ? resolved.relativePath.slice(0, resolved.relativePath.lastIndexOf('/'))
      : '',
    isRoot: !resolved.relativePath,
    breadcrumbs,
    entries: mappedEntries,
  }
}

async function clearDirectoryContents(targetDir: string) {
  const entries = await fsp.readdir(targetDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    await fsp.rm(path.join(targetDir, entry.name), { recursive: true, force: true })
  }
}

async function countFilesInDirectory(targetDir: string) {
  const entries = await fsp.readdir(targetDir, { withFileTypes: true }).catch(() => [])
  let count = 0
  for (const entry of entries) {
    if (entry.isFile()) {
      count += 1
      continue
    }
    if (entry.isDirectory()) {
      count += await countFilesInDirectory(path.join(targetDir, entry.name))
    }
  }
  return count
}

export async function cleanupWorkspaceDerivedFiles(params: {
  workspaceId: string
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  const before = await getWorkspaceSummary(workspaceId)
  const workspaceDir = getWorkspaceDir(workspaceId)
  await clearDirectoryContents(path.join(workspaceDir, 'output_images'))
  await clearDirectoryContents(path.join(workspaceDir, 'read_results'))
  const after = await getWorkspaceSummary(workspaceId)

  return {
    workspaceId,
    freedBytes: Math.max(before.totalBytes - after.totalBytes, 0),
    before,
    after,
  }
}

export async function rebuildMultiChapterSlots(params: {
  workspaceId: string
  jsonText: string
  slotCount: number
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }
  const slotCount = Math.trunc(Number(params.slotCount))
  if (!Number.isFinite(slotCount) || slotCount <= 0) {
    throw new Error('slotCount must be a positive integer')
  }

  await getExistingWorkspace(workspaceId)
  const rootDir = getMultiChapterRootDir(workspaceId)
  await fsp.rm(rootDir, { recursive: true, force: true }).catch(() => undefined)
  await fsp.mkdir(rootDir, { recursive: true })

  for (let index = 1; index <= slotCount; index += 1) {
    const slotName = normalizeMultiChapterSlotName(index)
    const slotDir = getMultiChapterSlotDir(workspaceId, slotName)
    const imagesDir = path.join(slotDir, 'images')
    const jsonFilePath = path.join(slotDir, getMultiChapterSlotJsonFileName(slotName))
    await fsp.mkdir(imagesDir, { recursive: true })
    await fsp.writeFile(jsonFilePath, params.jsonText, 'utf8')
  }

  return {
    workspaceId,
    rootRelativePath: MULTI_CHAPTER_ROOT_DIR,
    slots: await listMultiChapterSlots(workspaceId),
  }
}

export async function resolveMultiChapterSlot(params: {
  workspaceId: string
  slotName?: string | number
  slotRelativePath?: string
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }
  await getExistingWorkspace(workspaceId)

  const relativePathInput = getWorkspaceRelativePath(params.slotRelativePath || '')
  let slotName = String(params.slotName || '').trim()
  if (!slotName && relativePathInput) {
    const normalizedRelativePath = relativePathInput.replace(/^\/+/, '')
    const match = normalizedRelativePath.match(new RegExp(`^${MULTI_CHAPTER_ROOT_DIR}/([^/]+)$`, 'i'))
    if (match?.[1]) {
      slotName = match[1]
    } else if (/^\d+$/.test(normalizedRelativePath)) {
      slotName = normalizedRelativePath
    }
  }

  const normalizedSlotName = normalizeMultiChapterSlotName(slotName)
  const slotRelativePath = getMultiChapterSlotRelativePath(normalizedSlotName)
  const slotAbsolutePath = getMultiChapterSlotDir(workspaceId, normalizedSlotName)
  assertWorkspacePathInsideRoot(getWorkspaceDir(workspaceId), slotAbsolutePath)

  const slotStat = await statSafe(slotAbsolutePath)
  if (!slotStat?.isDirectory()) {
    throw new Error(`multi chapter slot not found: ${normalizedSlotName}`)
  }

  const jsonRelativePath = getMultiChapterSlotJsonRelativePath(normalizedSlotName)
  const jsonFilePath = path.join(getWorkspaceDir(workspaceId), jsonRelativePath)
  const jsonStat = await statSafe(jsonFilePath)
  if (!jsonStat?.isFile()) {
    throw new Error(`multi chapter slot json missing: ${normalizedSlotName}`)
  }

  const imagesRelativePath = getMultiChapterSlotImagesRelativePath(normalizedSlotName)
  const imagesDirPath = path.join(getWorkspaceDir(workspaceId), imagesRelativePath)
  await fsp.mkdir(imagesDirPath, { recursive: true })

  return {
    workspaceId,
    slotName: normalizedSlotName,
    slotRelativePath,
    slotAbsolutePath,
    jsonFileName: getMultiChapterSlotJsonFileName(normalizedSlotName),
    jsonRelativePath,
    jsonFilePath,
    imagesRelativePath,
    imagesDirPath,
  }
}

export async function listMultiChapterSlots(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    throw new Error('workspaceId is required')
  }
  await getExistingWorkspace(normalizedWorkspaceId)
  const rootDir = getMultiChapterRootDir(normalizedWorkspaceId)
  await fsp.mkdir(rootDir, { recursive: true })
  const entries = await fsp.readdir(rootDir, { withFileTypes: true }).catch(() => [])
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(async (entry) => {
        const slot = await resolveMultiChapterSlot({
          workspaceId: normalizedWorkspaceId,
          slotName: entry.name,
        }).catch(() => null)
        if (!slot) {
          return null
        }
        const slotStat = await statSafe(slot.slotAbsolutePath)
        const jsonStat = await statSafe(slot.jsonFilePath)
        const imagesStat = await statSafe(slot.imagesDirPath)
        return {
          slotName: slot.slotName,
          slotRelativePath: slot.slotRelativePath,
          slotAbsolutePath: slot.slotAbsolutePath,
          jsonFileName: slot.jsonFileName,
          jsonRelativePath: slot.jsonRelativePath,
          jsonFilePath: slot.jsonFilePath,
          imagesRelativePath: slot.imagesRelativePath,
          imagesDirPath: slot.imagesDirPath,
          imageCount: imagesStat?.isDirectory() ? await countFilesInDirectory(slot.imagesDirPath) : 0,
          createdAt: slotStat?.birthtime ? slotStat.birthtime.toISOString() : jsonStat?.birthtime?.toISOString() || '',
          updatedAt: (jsonStat?.mtime || slotStat?.mtime)?.toISOString?.() || '',
        } satisfies MultiChapterSlotSummary
      }),
  )

  return items
    .filter((item): item is MultiChapterSlotSummary => Boolean(item))
    .sort((a, b) => Number(a.slotName) - Number(b.slotName))
}

export async function overwriteMultiChapterSlotImages(params: {
  workspaceId: string
  slotName?: string | number
  slotRelativePath?: string
  files: Array<{
    originalname: string
    path: string
  }>
}) {
  const slot = await resolveMultiChapterSlot({
    workspaceId: params.workspaceId,
    slotName: params.slotName,
    slotRelativePath: params.slotRelativePath,
  })
  const files = Array.isArray(params.files) ? params.files : []
  if (!files.length) {
    throw new Error('images are required')
  }

  await clearDirectoryContents(slot.imagesDirPath)
  let importedCount = 0
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const originalName = String(file?.originalname || '').trim()
    const extension = path.extname(originalName).toLowerCase() || '.png'
    const storedFileName = `${String(index + 1).padStart(3, '0')}${extension}`
    await fsp.copyFile(String(file.path || '').trim(), path.join(slot.imagesDirPath, storedFileName))
    importedCount += 1
  }

  return {
    ...slot,
    importedCount,
    imageCount: await countFilesInDirectory(slot.imagesDirPath),
  }
}

export async function deleteWorkspace(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    throw new Error('workspaceId is required')
  }

  const summary = await getWorkspaceSummary(normalizedWorkspaceId)
  await fsp.rm(getWorkspaceDir(normalizedWorkspaceId), { recursive: true, force: true })
  return {
    workspaceId: normalizedWorkspaceId,
    removedBytes: summary.totalBytes,
    summary,
  }
}

export async function cleanupStaleWorkspaceDerivedAssets(params: {
  retentionDays: number
}) {
  const retentionDays = Number(params.retentionDays)
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return {
      checkedCount: 0,
      cleanedCount: 0,
      freedBytes: 0,
    }
  }

  const thresholdMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const entries = await fsp.readdir(WORKSPACES_DIR, { withFileTypes: true }).catch(() => [])
  let checkedCount = 0
  let cleanedCount = 0
  let freedBytes = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const workspaceId = entry.name
    const manifestPath = getWorkspaceManifestPath(workspaceId)
    const manifestStat = await statSafe(manifestPath)
    if (!manifestStat?.isFile() || manifestStat.mtimeMs >= thresholdMs) {
      continue
    }
    checkedCount += 1
    const result = await cleanupWorkspaceDerivedFiles({
      workspaceId,
    }).catch(() => null)
    if (!result) {
      continue
    }
    if (result.freedBytes > 0) {
      cleanedCount += 1
      freedBytes += result.freedBytes
    }
  }

  return {
    checkedCount,
    cleanedCount,
    freedBytes,
  }
}

export async function resolveWorkspaceAsset(params: {
  workspaceId: string
  assetId: string
  expectedType?: WorkspaceAssetType
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  const assetId = String(params.assetId || '').trim()
  if (!workspaceId || !assetId) {
    throw new Error('workspaceId and assetId are required')
  }

  const { manifest } = await ensureWorkspace({ workspaceId })
  const asset = manifest.assets.find((item) => item.assetId === assetId)
  if (!asset) {
    throw new Error(`asset ${assetId} not found in workspace ${workspaceId}`)
  }
  if (params.expectedType && asset.type !== params.expectedType) {
    throw new Error(`asset ${assetId} is not of type ${params.expectedType}`)
  }

  const filePath = path.join(getWorkspaceDir(workspaceId), asset.relativePath)
  const fileStat = await fsp.stat(filePath).catch(() => null)
  if (!fileStat?.isFile()) {
    throw new Error(`asset file missing on disk: ${asset.relativePath}`)
  }

  return {
    workspaceId,
    asset,
    filePath,
    publicUrl: `/workspace-assets/${workspaceId}/${getWorkspaceRelativePath(asset.relativePath)}`,
  }
}

export async function registerWorkspaceAsset(params: {
  workspaceId: string
  assetId?: string
  type: WorkspaceAssetType
  fileName: string
  relativePath: string
  meta?: Record<string, unknown>
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  const { manifest } = await ensureWorkspace({ workspaceId })
  const timestamp = nowIso()
  const assetId = String(params.assetId || '').trim() || `asset_${batchId()}`
  const nextRecord: WorkspaceAssetRecord = {
    assetId,
    type: params.type,
    fileName: sanitizeFileName(params.fileName || assetId) || assetId,
    relativePath: getWorkspaceRelativePath(params.relativePath),
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: params.meta || undefined,
  }

  const existingIndex = manifest.assets.findIndex((item) => item.assetId === assetId)
  if (existingIndex >= 0) {
    nextRecord.createdAt = manifest.assets[existingIndex].createdAt
    manifest.assets.splice(existingIndex, 1, nextRecord)
  } else {
    manifest.assets.push(nextRecord)
  }
  manifest.updatedAt = timestamp
  await saveWorkspaceManifest(manifest)

  return {
    workspaceId,
    asset: nextRecord,
    filePath: path.join(getWorkspaceDir(workspaceId), nextRecord.relativePath),
    publicUrl: `/workspace-assets/${workspaceId}/${nextRecord.relativePath}`,
  }
}

export async function writeWorkspaceJsonAsset(params: {
  workspaceId?: string
  fileName?: string
  text: string
  assetId?: string
  workspaceName?: string
  assetType?: Extract<WorkspaceAssetType, 'json'>
  relativeDir?: string
}) {
  const workspace = await ensureWorkspace({
    workspaceId: params.workspaceId,
    name: params.workspaceName,
  })
  const assetType = params.assetType || 'json'
  const fileName = normalizeJsonFileName(params.fileName || 'textbook.json')
  const isPrimaryJson = assetType === 'json' && !params.relativeDir
  const relativeDir = getWorkspaceRelativePath(params.relativeDir || 'output_json')
  const relativePath = isPrimaryJson
    ? PRIMARY_JSON_RELATIVE_PATH
    : path.posix.join(relativeDir, fileName)
  const filePath = path.join(workspace.workspaceDir, relativePath)
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, params.text, 'utf8')

  return await registerWorkspaceAsset({
    workspaceId: workspace.workspaceId,
    assetId: params.assetId || (isPrimaryJson ? PRIMARY_JSON_ASSET_ID : undefined),
    type: assetType,
    fileName,
    relativePath,
  })
}

export async function writeWorkspaceBinaryAsset(params: {
  workspaceId?: string
  fileName: string
  buffer?: Buffer
  sourceFilePath?: string
  assetId?: string
  workspaceName?: string
  type: Extract<WorkspaceAssetType, 'pdf'>
  relativeDir?: string
  meta?: Record<string, unknown>
}) {
  const workspace = await ensureWorkspace({
    workspaceId: params.workspaceId,
    name: params.workspaceName,
  })
  const fileName = sanitizeFileName(params.fileName) || `${params.type}_${batchId()}`
  const relativeDir = getWorkspaceRelativePath(params.relativeDir || 'uploads')
  const relativePath = path.posix.join(relativeDir, fileName)
  const filePath = path.join(workspace.workspaceDir, relativePath)
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  if (params.sourceFilePath) {
    await fsp.copyFile(params.sourceFilePath, filePath)
  } else if (params.buffer) {
    await fsp.writeFile(filePath, params.buffer)
  } else {
    throw new Error('buffer or sourceFilePath is required')
  }

  return await registerWorkspaceAsset({
    workspaceId: workspace.workspaceId,
    assetId: params.assetId,
    type: params.type,
    fileName,
    relativePath,
    meta: params.meta,
  })
}

export async function resolveManagedJsonInput(params: {
  workspaceId?: string
  jsonAssetId?: string
  jsonFilePath?: string
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  const jsonAssetId = String(params.jsonAssetId || '').trim()
  const jsonFilePath = String(params.jsonFilePath || '').trim()

  if (workspaceId && jsonAssetId) {
    const resolved = await resolveWorkspaceAsset({
      workspaceId,
      assetId: jsonAssetId,
      expectedType: 'json',
    })
    return {
      workspaceId,
      jsonAssetId,
      jsonFilePath: resolved.filePath,
      publicUrl: resolved.publicUrl,
      fileName: resolved.asset.fileName,
    }
  }

  if (workspaceId && jsonFilePath) {
    const workspaceRoot = path.resolve(getWorkspaceDir(workspaceId))
    const candidatePath = path.isAbsolute(jsonFilePath)
      ? path.resolve(jsonFilePath)
      : path.resolve(workspaceRoot, getWorkspaceRelativePath(jsonFilePath))
    if (!candidatePath.startsWith(workspaceRoot)) {
      throw new Error('jsonFilePath points outside of the workspace root')
    }
    const fileStat = await fsp.stat(candidatePath).catch(() => null)
    if (!fileStat?.isFile()) {
      throw new Error('jsonFilePath does not exist or is not a file')
    }
    return {
      workspaceId,
      jsonAssetId: '',
      jsonFilePath: candidatePath,
      publicUrl: `/workspace-assets/${workspaceId}/${getWorkspaceRelativePath(path.relative(workspaceRoot, candidatePath))}`,
      fileName: path.basename(candidatePath),
    }
  }

  if (!jsonFilePath) {
    throw new Error('jsonAssetId is required, or jsonFilePath must be provided')
  }

  const resolvedPath = path.resolve(jsonFilePath)
  const fileStat = await fsp.stat(resolvedPath).catch(() => null)
  if (!fileStat?.isFile()) {
    throw new Error('jsonFilePath does not exist or is not a file')
  }

  return {
    workspaceId: '',
    jsonAssetId: '',
    jsonFilePath: resolvedPath,
    publicUrl: '',
    fileName: path.basename(resolvedPath),
  }
}

export async function readWorkspaceJsonText(params: {
  workspaceId?: string
  jsonAssetId?: string
  filePath?: string
}) {
  const resolved = await resolveManagedJsonInput({
    workspaceId: params.workspaceId,
    jsonAssetId: params.jsonAssetId,
    jsonFilePath: params.filePath,
  })
  const text = await fsp.readFile(resolved.jsonFilePath, 'utf8')
  return {
    ...resolved,
    text,
  }
}
