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
  const relativeDir = getWorkspaceRelativePath(params.relativeDir || (assetType === 'repair_json' ? 'repair_json' : 'output_json'))
  const relativePath = path.posix.join(relativeDir, fileName)
  const filePath = path.join(workspace.workspaceDir, relativePath)
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, params.text, 'utf8')

  return await registerWorkspaceAsset({
    workspaceId: workspace.workspaceId,
    assetId: params.assetId,
    type: assetType,
    fileName,
    relativePath,
  })
}

export async function writeWorkspaceBinaryAsset(params: {
  workspaceId?: string
  fileName: string
  buffer: Buffer
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
  await fsp.writeFile(filePath, params.buffer)

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
