import fsp from 'node:fs/promises'
import path from 'node:path'
import { ARK_API_KEY, ARK_MODEL, REPAIR_JSON_DIR } from './config'
import type { TextbookJsonPayload } from './types'
import {
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
  buildCanonicalQuestionTitle,
  detectQuestionEmptyAnswerIssue,
  detectQuestionIntegrityIssue,
  extractArkText,
  extractFirstJsonObject,
  extractQuestionNoFromId,
  extractQuestionNoFromText,
  loadTextbookJson,
  normalizeQuestionItem,
  normalizeJsonFileName,
  normalizeTitle,
  parseModelJsonObject,
  regenerateModelJsonWithImagesByDoubao,
  repairModelJsonByDoubao,
  requestArkRawWithRetry,
  saveTextbookJson,
} from './question-bank-service'

function findChapterById(payload: TextbookJsonPayload, chapterId: string) {
  return payload.chapters.find((item) => item.chapterId === chapterId)
}

function buildCanonicalSectionTitle(chapterNo: number, sectionNo: number, fallback = '') {
  const normalizedFallback = normalizeTitle(fallback)
  if (normalizedFallback) {
    return normalizedFallback
  }
  return `习题${chapterNo}.${sectionNo}`
}

function findQuestionInsertIndex(existing: unknown[], questionId: string, chapterId: string) {
  const targetQuestionNo = Number(extractQuestionNoFromId(questionId) || 0)
  let lastSameChapterIndex = -1

  for (let index = 0; index < existing.length; index += 1) {
    const row = existing[index] as Record<string, unknown>
    const rowQuestionId = typeof row.questionId === 'string' ? row.questionId.trim() : ''
    const rowChapterId = typeof row.chapterId === 'string' ? row.chapterId.trim() : ''

    if (rowQuestionId && rowQuestionId === questionId) {
      return index
    }

    if (rowChapterId === chapterId) {
      lastSameChapterIndex = index
      const rowQuestionNo = Number(
        extractQuestionNoFromId(rowQuestionId) || extractQuestionNoFromText(String(row.title || '')) || 0,
      )
      if (targetQuestionNo && rowQuestionNo && rowQuestionNo > targetQuestionNo) {
        return index
      }
    }
  }

  if (lastSameChapterIndex >= 0) {
    return lastSameChapterIndex + 1
  }

  return existing.length
}

function buildRepairJsonFileName(sourceFileName: string, jsonFilePath: string) {
  const preferred = String(sourceFileName || '').trim()
  if (preferred) {
    const base = path.basename(preferred).replace(/[\\/:*?"<>|]/g, '_')
    return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
  }
  return normalizeJsonFileName(path.basename(jsonFilePath))
}

async function detectSingleQuestionRepairByDoubao(params: {
  imageDataUrls: string[]
  chapterTitle: string
  sectionTitle: string
  chapterId: string
  questionId: string
  questionNo: string
}) {
  const {
    imageDataUrls,
    chapterTitle,
    sectionTitle,
    chapterId,
    questionId,
    questionNo,
  } = params

  if (!ARK_API_KEY) {
    throw new Error('ARK_API_KEY is missing')
  }
  if (!Array.isArray(imageDataUrls) || !imageDataUrls.length) {
    throw new Error('imageDataUrls is required')
  }

  const instruction = [
    '你是教材题库定点修复器。你只负责从图片序列中提取指定的一道顶层大题，并输出这一题的合法 JSON。',
    `- 当前章标题: ${chapterTitle}`,
    `- 当前小节标题: ${sectionTitle}`,
    `- 目标 chapterId: ${chapterId}`,
    `- 目标 questionId: ${questionId}`,
    `- 目标顶层题号: 第${questionNo}题`,
    `- 输入图片数量: ${imageDataUrls.length}`,
    '规则:',
    `1) 所有图片按上传顺序组成一个连续阅读序列；如果这道题跨页，你必须跨图合并后再提取。`,
    `2) 只提取“第${questionNo}题”这一道顶层大题；其他题一律忽略。`,
    `3) 如果图片序列中没有出现第${questionNo}题，或第${questionNo}题在整个序列里仍没有完整显示，found 必须返回 false。`,
    '4) 如果该题在前一张开始、后一张结束，你必须把它当作同一道题处理，不能拆成两题，也不能只提取半题。',
    '5) 若该题是综合题/长题，允许输出 GROUP，并完整提取所有可见且属于该题的小问。',
    '6) 若该题是单一题目，输出 LEAF。',
    `7) 输出题目的 questionId 必须使用 ${questionId}；若是 GROUP.children，子题 questionId 必须在此基础上按 _1, _2 ... 递增。`,
    `8) 输出题目的 chapterId 必须固定为 ${chapterId}。`,
    `9) 题目 title 必须使用“小节标题 + 第几题”格式，即 ${sectionTitle} 第${questionNo}题。`,
    ...buildSharedQuestionContentRuleLines(10, 'questionToUpsert'),
    ...buildSharedQuestionStructureInstructionLines(),
    '严格输出 JSON：',
    '{',
    '  "found": true/false,',
    '  "reason": "string",',
    '  "questionToUpsert": { ...question object... }',
    '}',
  ].join('\n')

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '你只输出合法 JSON。' }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: instruction },
          ...imageDataUrls.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
        ],
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Repair output is not JSON: ${text.slice(0, 500)}`)
  }

  let output: Record<string, unknown>
  try {
    output = parseModelJsonObject(jsonText)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    try {
      output = await regenerateModelJsonWithImagesByDoubao({
        imageDataUrls,
        originalInstruction: instruction,
        parseError,
        previousOutputText: text,
      })
    } catch (regenerateError) {
      const regenerateMsg = regenerateError instanceof Error ? regenerateError.message : String(regenerateError)
      output = await repairModelJsonByDoubao({
        brokenOutputText: text,
        parseError: `${parseError}; regenerate=${regenerateMsg}`,
      })
    }
  }

  const questionNode =
    output.questionToUpsert && typeof output.questionToUpsert === 'object'
      ? (output.questionToUpsert as Record<string, unknown>)
      : output.question && typeof output.question === 'object'
        ? (output.question as Record<string, unknown>)
        : null

  return {
    found: output.found === true,
    reason: typeof output.reason === 'string' ? output.reason : '',
    rawText: text,
    questionToUpsert: questionNode,
  }
}

export async function repairQuestionInTextbookJson(params: {
  jsonFilePath: string
  chapterNo: number
  sectionNo: number
  questionNo: number
  imageDataUrls: string[]
  imageLabels?: string[]
  sourceFileName?: string
}) {
  const {
    jsonFilePath,
    chapterNo,
    sectionNo,
    questionNo,
    imageDataUrls,
    imageLabels = [],
    sourceFileName = '',
  } = params

  if (!Number.isInteger(chapterNo) || chapterNo <= 0) {
    throw new Error('chapterNo must be a positive integer')
  }
  if (!Number.isInteger(sectionNo) || sectionNo <= 0) {
    throw new Error('sectionNo must be a positive integer')
  }
  if (!Number.isInteger(questionNo) || questionNo <= 0) {
    throw new Error('questionNo must be a positive integer')
  }

  const payload = await loadTextbookJson(jsonFilePath)
  const topChapterId = `ch_${chapterNo}`
  const sectionChapterId = `ch_${chapterNo}_${sectionNo}`
  const topChapter = findChapterById(payload, topChapterId)
  if (!topChapter) {
    throw new Error(`chapterId ${topChapterId} not found in JSON`)
  }

  const section = findChapterById(payload, sectionChapterId)
  if (!section) {
    throw new Error(`chapterId ${sectionChapterId} not found in JSON`)
  }

  const targetQuestionId = `q_${chapterNo}_${sectionNo}_${questionNo}`
  const repairDetect = await detectSingleQuestionRepairByDoubao({
    imageDataUrls,
    chapterTitle: topChapter.title,
    sectionTitle: buildCanonicalSectionTitle(chapterNo, sectionNo, section.title),
    chapterId: sectionChapterId,
    questionId: targetQuestionId,
    questionNo: String(questionNo),
  })

  if (!repairDetect.found || !repairDetect.questionToUpsert) {
    throw new Error(repairDetect.reason || `图片中未能完整识别第${questionNo}题`)
  }

  const normalized = normalizeQuestionItem(
    {
      ...repairDetect.questionToUpsert,
      questionId: targetQuestionId,
      chapterId: sectionChapterId,
      title: buildCanonicalQuestionTitle(section.title, String(questionNo)),
    },
    sectionChapterId,
    section.title,
  )

  if (!normalized) {
    throw new Error('修复结果无法规范化为题目结构')
  }

  const normalizedQuestionNo =
    extractQuestionNoFromId(normalized.questionId) || extractQuestionNoFromText(normalized.title)
  if (String(normalizedQuestionNo || '') !== String(questionNo)) {
    throw new Error(`模型返回题号与目标不一致: target=${questionNo}, got=${normalizedQuestionNo || 'unknown'}`)
  }

  const emptyAnswerIssue = detectQuestionEmptyAnswerIssue(normalized)
  if (emptyAnswerIssue) {
    throw new Error(emptyAnswerIssue)
  }

  const integrityIssue = detectQuestionIntegrityIssue([normalized])
  if (integrityIssue) {
    throw new Error(integrityIssue.reason)
  }

  const existing = Array.isArray(payload.questions) ? [...payload.questions] : []
  const replaceIndex = existing.findIndex((item) => {
    const row = item as Record<string, unknown>
    return typeof row.questionId === 'string' && row.questionId.trim() === targetQuestionId
  })

  const insertIndex =
    replaceIndex >= 0 ? replaceIndex : findQuestionInsertIndex(existing, targetQuestionId, sectionChapterId)

  if (replaceIndex >= 0) {
    existing[replaceIndex] = normalized
  } else {
    existing.splice(insertIndex, 0, normalized)
  }

  payload.questions = existing
  await saveTextbookJson(jsonFilePath, payload)
  const repairJsonFileName = buildRepairJsonFileName(sourceFileName, jsonFilePath)
  const repairJsonPath = path.join(REPAIR_JSON_DIR, repairJsonFileName)
  await fsp.writeFile(repairJsonPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' })

  return {
    message: 'success',
    jsonFilePath,
    repairJsonFileName,
    repairJsonPath,
    imageLabel: imageLabels.join(' + '),
    imageCount: imageDataUrls.length,
    chapterTitle: topChapter.title,
    sectionTitle: section.title,
    chapterId: sectionChapterId,
    questionId: targetQuestionId,
    questionTitle: normalized.title,
    action: replaceIndex >= 0 ? 'replaced' : 'inserted',
    insertIndex,
    questionsCount: existing.length,
    reason: repairDetect.reason,
    rawText: repairDetect.rawText,
    question: normalized,
  }
}
