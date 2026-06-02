import path from 'node:path'
import type { Request } from 'express'
import { resolveManagedJsonInput, resolveMultiChapterSlot } from '../workspace-store'

function getArkApiKeyFromRequest(req: Request) {
  return String(req.header('x-ark-api-key') || '').trim()
}

function getSlotRelativePathFromBody(body: unknown) {
  return String((body as Record<string, unknown> | null)?.slotRelativePath || '').trim()
}

async function resolveChapterSessionTargetFromBody(body: unknown) {
  const slotRelativePath = getSlotRelativePathFromBody(body)
  const workspaceIdInput = String((body as Record<string, unknown> | null)?.workspaceId || '').trim()
  if (slotRelativePath) {
    const slot = await resolveMultiChapterSlot({
      workspaceId: workspaceIdInput,
      slotRelativePath,
    })
    return {
      jsonFilePath: slot.jsonFilePath,
      workspaceId: slot.workspaceId,
      jsonAssetId: '',
      slotRelativePath: slot.slotRelativePath,
      slotName: slot.slotName,
      imagesDirPath: slot.imagesDirPath,
    }
  }

  const resolved = await resolveManagedJsonInput({
    workspaceId: workspaceIdInput,
    jsonAssetId: String((body as Record<string, unknown> | null)?.jsonAssetId || '').trim(),
    jsonFilePath: String((body as Record<string, unknown> | null)?.jsonFilePath || '').trim(),
  })
  return {
    jsonFilePath: resolved.jsonFilePath,
    workspaceId: resolved.workspaceId,
    jsonAssetId: resolved.jsonAssetId,
    slotRelativePath: '',
    slotName: '',
    imagesDirPath: '',
  }
}

async function resolveChapterSessionImageDirFromBody(body: unknown) {
  const slotRelativePath = getSlotRelativePathFromBody(body)
  const workspaceIdInput = String((body as Record<string, unknown> | null)?.workspaceId || '').trim()
  if (slotRelativePath) {
    const slot = await resolveMultiChapterSlot({
      workspaceId: workspaceIdInput,
      slotRelativePath,
    })
    return {
      imageDir: slot.imagesDirPath,
      slotRelativePath: slot.slotRelativePath,
      slotName: slot.slotName,
      workspaceId: slot.workspaceId,
    }
  }

  const imageDirRaw = String((body as Record<string, unknown> | null)?.imageDir || '').trim()
  if (!imageDirRaw) {
    throw new Error('imageDir is required')
  }
  return {
    imageDir: path.resolve(imageDirRaw),
    slotRelativePath: '',
    slotName: '',
    workspaceId: workspaceIdInput,
  }
}

export {
  getArkApiKeyFromRequest,
  resolveChapterSessionImageDirFromBody,
  resolveChapterSessionTargetFromBody,
}
