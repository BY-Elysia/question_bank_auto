import fsp from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACES_DIR } from './config'
import { batchId, normalizeJsonFileName, sanitizeFileName } from './question-bank-service'

export type WorkspaceAssetType = 'json' | 'pdf' | 'image_batch' | 'repair_json'

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

const MANIFEST_FILE_NAME = 'workspace.json'
const PRIMARY_JSON_ASSET_ID = 'json_main'
const PRIMARY_JSON_RELATIVE_PATH = 'output_json/main.json'
const SUMMARY_DIRS = ['output_json', 'repair_json', 'uploads', 'output_images', 'read_results'] as const

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
  await fsp.mkdir(path.join(workspaceDir, 'repair_json'), { recursive: true })
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

async function clearDirectoryContents(targetDir: string) {
  const entries = await fsp.readdir(targetDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    await fsp.rm(path.join(targetDir, entry.name), { recursive: true, force: true })
  }
}

async function pruneRepairSnapshots(workspaceDir: string, keepLatestCount: number) {
  const repairDir = path.join(workspaceDir, 'repair_json')
  const entries = await fsp.readdir(repairDir, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const absolutePath = path.join(repairDir, entry.name)
        const stat = await statSafe(absolutePath)
        return {
          absolutePath,
          entryName: entry.name,
          mtimeMs: stat?.mtimeMs || 0,
        }
      }),
  )
  const staleFiles = files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(Math.max(keepLatestCount, 0))
  await Promise.all(staleFiles.map((file) => fsp.rm(file.absolutePath, { force: true })))
  return staleFiles.length
}

export async function cleanupWorkspaceDerivedFiles(params: {
  workspaceId: string
  keepRepairSnapshots?: number
}) {
  const workspaceId = String(params.workspaceId || '').trim()
  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  const before = await getWorkspaceSummary(workspaceId)
  const workspaceDir = getWorkspaceDir(workspaceId)
  await clearDirectoryContents(path.join(workspaceDir, 'output_images'))
  await clearDirectoryContents(path.join(workspaceDir, 'read_results'))
  const removedRepairSnapshots = await pruneRepairSnapshots(workspaceDir, params.keepRepairSnapshots ?? 10)
  const after = await getWorkspaceSummary(workspaceId)

  return {
    workspaceId,
    removedRepairSnapshots,
    freedBytes: Math.max(before.totalBytes - after.totalBytes, 0),
    before,
    after,
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
  keepRepairSnapshots?: number
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
      keepRepairSnapshots: params.keepRepairSnapshots ?? 5,
    }).catch(() => null)
    if (!result) {
      continue
    }
    if (result.freedBytes > 0 || result.removedRepairSnapshots > 0) {
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
  assetType?: Extract<WorkspaceAssetType, 'json' | 'repair_json'>
  relativeDir?: string
}) {
  const workspace = await ensureWorkspace({
    workspaceId: params.workspaceId,
    name: params.workspaceName,
  })
  const assetType = params.assetType || 'json'
  const fileName = normalizeJsonFileName(params.fileName || 'textbook.json')
  const isPrimaryJson = assetType === 'json' && !params.relativeDir
  const relativeDir = getWorkspaceRelativePath(params.relativeDir || (assetType === 'repair_json' ? 'repair_json' : 'output_json'))
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

export async function writeWorkspaceRepairSnapshot(params: {
  workspaceId: string
  sourceFileName?: string
  jsonFilePath: string
  payload: unknown
}) {
  const preferred = String(params.sourceFileName || '').trim()
  const fileName = preferred
    ? normalizeJsonFileName(preferred)
    : normalizeJsonFileName(path.basename(params.jsonFilePath))

  return await writeWorkspaceJsonAsset({
    workspaceId: params.workspaceId,
    fileName,
    text: `${JSON.stringify(params.payload, null, 2)}\n`,
    assetType: 'repair_json',
  })
}
