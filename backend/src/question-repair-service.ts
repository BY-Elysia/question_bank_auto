import fsp from 'node:fs/promises'
import path from 'node:path'
import { ARK_MODEL, REPAIR_JSON_DIR } from './config'
import {
  buildLegacyQuestionId,
  parseQuestionIdParts,
  resolveChapterTitles,
} from './question-json-target'
import type { TextbookJsonPayload } from './types'
import {
  buildCanonicalQuestionTitle,
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
  detectQuestionEmptyAnswerIssue,
  detectQuestionIntegrityIssue,
  extractArkText,
  extractFirstJsonObject,
  extractQuestionNoFromId,
  extractQuestionNoFromText,
  getPayloadAnswerHandlingMode,
  loadTextbookJson,
  normalizeJsonFileName,
  normalizeQuestionItem,
  parseModelJsonObject,
  payloadExpectsAnswer,
  regenerateModelJsonWithImagesByDoubao,
  repairModelJsonByDoubao,
  requestArkRawWithRetry,
  saveTextbookJson,
} from './question-bank-service'

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

function resolveRepairScope(params: {
  payload: TextbookJsonPayload
  chapterNo?: number
  sectionNo?: number
  questionNo?: number
  questionId?: string
}) {
  const { payload, chapterNo, sectionNo, questionNo, questionId = '' } = params
  const resolvedQuestionId = String(questionId || '').trim()
    || (
      Number.isInteger(chapterNo) &&
      Number.isInteger(sectionNo) &&
      Number.isInteger(questionNo)
        ? buildLegacyQuestionId(Number(chapterNo), Number(sectionNo), Number(questionNo))
        : ''
    )
  if (!resolvedQuestionId) {
    throw new Error('questionId is required, or chapterNo/sectionNo/questionNo must all be positive integers')
  }

  const parts = parseQuestionIdParts(resolvedQuestionId)
  if (!parts) {
    throw new Error(`questionId ${resolvedQuestionId} is invalid`)
  }

  const resolvedChapterId = parts.sectionNo > 0 ? `ch_${parts.chapterNo}_${parts.sectionNo}` : `ch_${parts.chapterNo}`
  const titles = resolveChapterTitles(payload, resolvedChapterId)
  if (!titles.sectionTitle) {
    throw new Error(`chapterId ${resolvedChapterId} not found in JSON`)
  }

  return {
    questionId: resolvedQuestionId,
    chapterId: resolvedChapterId,
    questionNo: String(parts.questionNo),
    chapterTitle: titles.chapterTitle,
    sectionTitle: titles.sectionTitle,
  }
}

async function detectSingleQuestionRepairByDoubao(params: {
  imageDataUrls: string[]
  chapterTitle: string
  sectionTitle: string
  chapterId: string
  questionId: string
  questionNo: string
  answerHandlingMode: 'extract_visible' | 'leave_empty' | 'generate_brief'
}) {
  const {
    imageDataUrls,
    chapterTitle,
    sectionTitle,
    chapterId,
    questionId,
    questionNo,
    answerHandlingMode,
  } = params

  if (!Array.isArray(imageDataUrls) || !imageDataUrls.length) {
    throw new Error('imageDataUrls is required')
  }

  const instruction = [
    '你是题库定点修复器。你只负责从图片序列中提取指定的一道顶层大题，并输出这一题的合法 JSON。',
    `- 当前章标题: ${chapterTitle}`,
    `- 当前小节/结构标题: ${sectionTitle}`,
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
    `9) 题目 title 必须使用“${sectionTitle} 第${questionNo}题”这种格式。`,
    answerHandlingMode === 'generate_brief'
      ? '10) 这是无答案教材，standardAnswer 需要由模型根据题目自行生成简洁适量的答案；若是编程/写代码题，则保持空答案。'
      : answerHandlingMode === 'leave_empty'
        ? '10) 这是无答案文档，所有 standardAnswer 字段必须保留，但 text 为空、media 为空数组。'
        : '10) 这是有答案文档，若图片中出现答案，standardAnswer 必须按原文提取。',
    ...buildSharedQuestionContentRuleLines(11, 'questionToUpsert', answerHandlingMode),
    ...buildSharedQuestionStructureInstructionLines(answerHandlingMode),
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
  chapterNo?: number
  sectionNo?: number
  questionNo?: number
  questionId?: string
  imageDataUrls: string[]
  imageLabels?: string[]
  sourceFileName?: string
}) {
  const {
    jsonFilePath,
    chapterNo,
    sectionNo,
    questionNo,
    questionId = '',
    imageDataUrls,
    imageLabels = [],
    sourceFileName = '',
  } = params

  const payload = await loadTextbookJson(jsonFilePath)
  const answerHandlingMode = getPayloadAnswerHandlingMode(payload)
  const expectAnswer = payloadExpectsAnswer(payload)
  const allowBlankCodeAnswer = answerHandlingMode === 'generate_brief'
  const scope = resolveRepairScope({
    payload,
    chapterNo,
    sectionNo,
    questionNo,
    questionId,
  })

  const repairDetect = await detectSingleQuestionRepairByDoubao({
    imageDataUrls,
    chapterTitle: scope.chapterTitle,
    sectionTitle: scope.sectionTitle,
    chapterId: scope.chapterId,
    questionId: scope.questionId,
    questionNo: scope.questionNo,
    answerHandlingMode,
  })

  if (!repairDetect.found || !repairDetect.questionToUpsert) {
    throw new Error(repairDetect.reason || `图片中未能完整识别第${scope.questionNo}题`)
  }

  const normalized = normalizeQuestionItem(
    {
      ...repairDetect.questionToUpsert,
      questionId: scope.questionId,
      chapterId: scope.chapterId,
      title: buildCanonicalQuestionTitle(scope.sectionTitle, scope.questionNo),
    },
    scope.chapterId,
    scope.sectionTitle,
    {
      expectAnswer,
      answerHandlingMode,
    },
  )

  if (!normalized) {
    throw new Error('修复结果无法规范化为题目结构')
  }

  const normalizedQuestionNo =
    extractQuestionNoFromId(normalized.questionId) || extractQuestionNoFromText(normalized.title)
  if (String(normalizedQuestionNo || '') !== String(scope.questionNo)) {
    throw new Error(`模型返回题号与目标不一致: target=${scope.questionNo}, got=${normalizedQuestionNo || 'unknown'}`)
  }

  const emptyAnswerIssue = detectQuestionEmptyAnswerIssue(normalized, { expectAnswer, allowBlankCodeAnswer })
  if (emptyAnswerIssue) {
    throw new Error(emptyAnswerIssue)
  }

  const integrityIssue = detectQuestionIntegrityIssue([normalized], { expectAnswer, allowBlankCodeAnswer })
  if (integrityIssue) {
    throw new Error(integrityIssue.reason)
  }

  const existing = Array.isArray(payload.questions) ? [...payload.questions] : []
  const replaceIndex = existing.findIndex((item) => {
    const row = item as Record<string, unknown>
    return typeof row.questionId === 'string' && row.questionId.trim() === scope.questionId
  })

  const insertIndex =
    replaceIndex >= 0 ? replaceIndex : findQuestionInsertIndex(existing, scope.questionId, scope.chapterId)

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
    chapterTitle: scope.chapterTitle,
    sectionTitle: scope.sectionTitle,
    chapterId: scope.chapterId,
    questionId: scope.questionId,
    questionTitle: normalized.title,
    action: replaceIndex >= 0 ? 'replaced' : 'inserted',
    insertIndex,
    questionsCount: existing.length,
    reason: repairDetect.reason,
    rawText: repairDetect.rawText,
    question: normalized,
    expectAnswer,
  }
}
