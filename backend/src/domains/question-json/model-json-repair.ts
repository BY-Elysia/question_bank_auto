import { ARK_MODEL } from '../../config'
import { extractArkText, requestArkRawWithRetry } from '../../infrastructure/ark/ark-client'
import { extractFirstJsonObject, parseModelJsonObject } from './model-json'

async function repairModelJsonByDoubao(params: {
  brokenOutputText: string
  parseError: string
}): Promise<Record<string, unknown>> {
  const { brokenOutputText, parseError } = params
  const instruction = [
    '你是 JSON 修复器。',
    '下面给你一段模型输出和解析错误，请修复为可 JSON.parse 的对象。',
    '要求：',
    '1) 保留原语义，不要新增解释文本。',
    '2) 只输出 JSON 对象，不要 markdown。',
    '3) 顶层仍为 chapter/question 结构。',
    `解析错误: ${parseError}`,
    '原输出如下：',
    brokenOutputText,
  ].join('\n')

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '只输出可解析 JSON。' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: instruction }],
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
  return parseModelJsonObject(jsonText)
}

async function regenerateModelJsonWithImagesByDoubao(params: {
  imageDataUrls: string[]
  originalInstruction: string
  parseError: string
  previousOutputText: string
}): Promise<Record<string, unknown>> {
  const { imageDataUrls, originalInstruction, parseError, previousOutputText } = params
  const retryInstruction = [
    originalInstruction,
    '上一次输出 JSON 解析失败，请基于同一批图片重新生成完整 JSON。',
    `解析错误: ${parseError}`,
    '要求:',
    '1) 必须重新看图生成，不要直接复述上一次文本。',
    '2) 仅输出 JSON 对象，不要 markdown。',
    '3) 严格保证 JSON 可被 JSON.parse。',
    '上一次失败输出如下(仅供纠错参考):',
    previousOutputText,
  ].join('\n')

  const userContent: Array<Record<string, string>> = [{ type: 'input_text', text: retryInstruction }]
  for (const dataUrl of imageDataUrls) {
    userContent.push({ type: 'input_image', image_url: dataUrl })
  }

  const body = {
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: '只输出可解析 JSON。' }],
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0,
  }

  const raw = await requestArkRawWithRetry(body as Record<string, unknown>)
  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`Regenerate output is not JSON: ${text.slice(0, 500)}`)
  }
  return parseModelJsonObject(jsonText)
}

export { repairModelJsonByDoubao, regenerateModelJsonWithImagesByDoubao }
