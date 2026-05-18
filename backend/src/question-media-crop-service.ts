import sharp from 'sharp'
import type { QuestionGroup, QuestionItem, QuestionLeaf, QuestionTextBlock } from './types'
import { writeQuestionMediaBuffers } from './question-media-store'

export type QuestionMediaCropSource = {
  label: string
  filePath?: string
  buffer?: Buffer
}

type RelativeCropSpec = {
  sourcePageIndex: number
  x1: number
  y1: number
  x2: number
  y2: number
  caption: string
  orderNo: number
}

type CropSourceMetadata = {
  width: number
  height: number
}

type QuestionMediaRecord = QuestionTextBlock['media'][number]

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : NaN
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function buildPersistedMediaItem(item: Record<string, unknown>, index: number) {
  const url = typeof item.url === 'string' ? item.url.trim() : ''
  if (!url || (!url.startsWith('/workspace-assets/') && !url.startsWith('/uploads/'))) {
    return null
  }
  return {
    type: 'image' as const,
    url,
    caption: typeof item.caption === 'string' ? item.caption : '',
    orderNo: Number.isFinite(Number(item.orderNo)) && Number(item.orderNo) > 0 ? Number(item.orderNo) : index + 1,
  }
}

function extractRelativeCropSpec(item: Record<string, unknown>, index: number): RelativeCropSpec | null {
  const nested = isObject(item.crop) ? item.crop : null
  const pageIndex =
    toFiniteNumber(item.sourcePageIndex)
    || toFiniteNumber(item.pageIndex)
    || toFiniteNumber(item.imageIndex)
    || (nested ? toFiniteNumber(nested.sourcePageIndex) || toFiniteNumber(nested.pageIndex) || toFiniteNumber(nested.imageIndex) : NaN)

  const x1 = clamp01(
    toFiniteNumber(item.x1)
    || (nested ? toFiniteNumber(nested.x1) : NaN)
    || toFiniteNumber(item.left)
    || (nested ? toFiniteNumber(nested.left) : NaN),
  )
  const y1 = clamp01(
    toFiniteNumber(item.y1)
    || (nested ? toFiniteNumber(nested.y1) : NaN)
    || toFiniteNumber(item.top)
    || (nested ? toFiniteNumber(nested.top) : NaN),
  )
  const x2 = clamp01(
    toFiniteNumber(item.x2)
    || (nested ? toFiniteNumber(nested.x2) : NaN)
    || toFiniteNumber(item.right)
    || (nested ? toFiniteNumber(nested.right) : NaN),
  )
  const y2 = clamp01(
    toFiniteNumber(item.y2)
    || (nested ? toFiniteNumber(nested.y2) : NaN)
    || toFiniteNumber(item.bottom)
    || (nested ? toFiniteNumber(nested.bottom) : NaN),
  )

  if (!Number.isFinite(pageIndex) || pageIndex <= 0) {
    return null
  }
  if (x2 <= x1 || y2 <= y1) {
    return null
  }

  return {
    sourcePageIndex: Math.trunc(pageIndex),
    x1,
    y1,
    x2,
    y2,
    caption: typeof item.caption === 'string' ? item.caption : '',
    orderNo: Number.isFinite(Number(item.orderNo)) && Number(item.orderNo) > 0 ? Number(item.orderNo) : index + 1,
  }
}

function createEmptyTextBlock(block: QuestionTextBlock) {
  block.media = []
}

async function readCropSourceMetadata(source: QuestionMediaCropSource) {
  const instance = source.filePath ? sharp(source.filePath) : source.buffer ? sharp(source.buffer) : null
  if (!instance) {
    return null
  }
  const metadata = await instance.metadata().catch(() => null)
  if (!metadata?.width || !metadata.height) {
    return null
  }
  return {
    width: metadata.width,
    height: metadata.height,
  } satisfies CropSourceMetadata
}

async function cropSourceImage(params: {
  source: QuestionMediaCropSource
  metadata: CropSourceMetadata
  spec: RelativeCropSpec
}) {
  const { source, metadata, spec } = params
  const padRatio = 0.0125
  const leftBase = Math.round(spec.x1 * metadata.width)
  const topBase = Math.round(spec.y1 * metadata.height)
  const rightBase = Math.round(spec.x2 * metadata.width)
  const bottomBase = Math.round(spec.y2 * metadata.height)
  const padX = Math.round((rightBase - leftBase) * padRatio)
  const padY = Math.round((bottomBase - topBase) * padRatio)
  const left = Math.max(0, leftBase - padX)
  const top = Math.max(0, topBase - padY)
  const right = Math.min(metadata.width, rightBase + padX)
  const bottom = Math.min(metadata.height, bottomBase + padY)
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)

  if (width < 12 || height < 12) {
    return null
  }

  const instance = source.filePath ? sharp(source.filePath) : source.buffer ? sharp(source.buffer) : null
  if (!instance) {
    return null
  }

  return await instance
    .extract({ left, top, width, height })
    .png()
    .toBuffer()
    .catch(() => null)
}

async function resolveBlockMediaByCropping(params: {
  block: QuestionTextBlock
  targetKey: string
  targetField: string
  sources: QuestionMediaCropSource[]
  sourceMetadataCache: Map<number, CropSourceMetadata | null>
  workspaceId?: string
  sourceFileName?: string
  jsonFilePath: string
  namespace?: string
}) {
  const mediaItems = Array.isArray(params.block.media) ? params.block.media : []
  if (!mediaItems.length) {
    createEmptyTextBlock(params.block)
    return
  }

  const cropSpecs = mediaItems
    .map((item, index) => (isObject(item) ? extractRelativeCropSpec(item, index) : null))
    .filter((item): item is RelativeCropSpec => Boolean(item))
    .sort((a, b) => a.orderNo - b.orderNo)

  if (!cropSpecs.length) {
    const persistedMediaItems: QuestionMediaRecord[] = []
    for (let index = 0; index < mediaItems.length; index += 1) {
      const item = mediaItems[index]
      if (!isObject(item)) {
        continue
      }
      const persistedItem = buildPersistedMediaItem(item, index)
      if (persistedItem) {
        persistedMediaItems.push(persistedItem)
      }
    }
    params.block.media = persistedMediaItems
    return
  }

  const croppedBuffers: Array<{ buffer: Buffer; caption: string; extension: string }> = []
  for (const spec of cropSpecs) {
    const sourceIndex = spec.sourcePageIndex - 1
    const source = params.sources[sourceIndex]
    if (!source) {
      continue
    }

    let metadata = params.sourceMetadataCache.get(sourceIndex)
    if (metadata === undefined) {
      metadata = await readCropSourceMetadata(source)
      params.sourceMetadataCache.set(sourceIndex, metadata)
    }
    if (!metadata) {
      continue
    }

    const cropped = await cropSourceImage({
      source,
      metadata,
      spec,
    })
    if (!cropped) {
      continue
    }
    croppedBuffers.push({
      buffer: cropped,
      caption: spec.caption,
      extension: '.png',
    })
  }

  if (!croppedBuffers.length) {
    createEmptyTextBlock(params.block)
    return
  }

  const stored = await writeQuestionMediaBuffers({
    workspaceId: params.workspaceId,
    sourceFileName: params.sourceFileName,
    jsonFilePath: params.jsonFilePath,
    targetKey: params.targetKey,
    targetField: params.targetField,
    namespace: params.namespace,
    files: croppedBuffers,
  })
  params.block.media = stored.mediaItems
}

async function resolveQuestionLeafMedia(params: {
  question: QuestionLeaf
  sources: QuestionMediaCropSource[]
  sourceMetadataCache: Map<number, CropSourceMetadata | null>
  workspaceId?: string
  sourceFileName?: string
  jsonFilePath: string
  namespace?: string
}) {
  await resolveBlockMediaByCropping({
    block: params.question.prompt,
    targetKey: params.question.questionId,
    targetField: 'prompt',
    sources: params.sources,
    sourceMetadataCache: params.sourceMetadataCache,
    workspaceId: params.workspaceId,
    sourceFileName: params.sourceFileName,
    jsonFilePath: params.jsonFilePath,
    namespace: params.namespace,
  })

  await resolveBlockMediaByCropping({
    block: params.question.standardAnswer,
    targetKey: params.question.questionId,
    targetField: 'standardAnswer',
    sources: params.sources,
    sourceMetadataCache: params.sourceMetadataCache,
    workspaceId: params.workspaceId,
    sourceFileName: params.sourceFileName,
    jsonFilePath: params.jsonFilePath,
    namespace: params.namespace,
  })
}

async function resolveQuestionGroupMedia(params: {
  question: QuestionGroup
  sources: QuestionMediaCropSource[]
  sourceMetadataCache: Map<number, CropSourceMetadata | null>
  workspaceId?: string
  sourceFileName?: string
  jsonFilePath: string
  namespace?: string
}) {
  await resolveBlockMediaByCropping({
    block: params.question.stem,
    targetKey: params.question.questionId,
    targetField: 'stem',
    sources: params.sources,
    sourceMetadataCache: params.sourceMetadataCache,
    workspaceId: params.workspaceId,
    sourceFileName: params.sourceFileName,
    jsonFilePath: params.jsonFilePath,
    namespace: params.namespace,
  })

  for (const child of Array.isArray(params.question.children) ? params.question.children : []) {
    await resolveBlockMediaByCropping({
      block: child.prompt,
      targetKey: child.questionId,
      targetField: 'prompt',
      sources: params.sources,
      sourceMetadataCache: params.sourceMetadataCache,
      workspaceId: params.workspaceId,
      sourceFileName: params.sourceFileName,
      jsonFilePath: params.jsonFilePath,
      namespace: params.namespace,
    })

    await resolveBlockMediaByCropping({
      block: child.standardAnswer,
      targetKey: child.questionId,
      targetField: 'standardAnswer',
      sources: params.sources,
      sourceMetadataCache: params.sourceMetadataCache,
      workspaceId: params.workspaceId,
      sourceFileName: params.sourceFileName,
      jsonFilePath: params.jsonFilePath,
      namespace: params.namespace,
    })
  }
}

export async function resolveQuestionMediaCrops(params: {
  questions: QuestionItem[]
  sources: QuestionMediaCropSource[]
  workspaceId?: string
  sourceFileName?: string
  jsonFilePath: string
  namespace?: string
}) {
  const questions = Array.isArray(params.questions) ? params.questions : []
  const sources = Array.isArray(params.sources) ? params.sources.filter((item) => item && (item.filePath || item.buffer)) : []
  if (!questions.length || !sources.length) {
    return questions
  }

  const sourceMetadataCache = new Map<number, CropSourceMetadata | null>()
  for (const question of questions) {
    if (!question) {
      continue
    }
    if (question.nodeType === 'GROUP') {
      await resolveQuestionGroupMedia({
        question,
        sources,
        sourceMetadataCache,
        workspaceId: params.workspaceId,
        sourceFileName: params.sourceFileName,
        jsonFilePath: params.jsonFilePath,
        namespace: params.namespace,
      })
      continue
    }
    await resolveQuestionLeafMedia({
      question,
      sources,
      sourceMetadataCache,
      workspaceId: params.workspaceId,
      sourceFileName: params.sourceFileName,
      jsonFilePath: params.jsonFilePath,
      namespace: params.namespace,
    })
  }

  return questions
}
