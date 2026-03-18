import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ARK_MODEL, PORT } from './config'
import { extractArkText, extractFirstJsonObject, parseModelJsonObject, requestArkRawWithRetry } from './question-bank-service'

type AssistantRole = 'user' | 'assistant'

export type QuestionBankAssistantMessage = {
  role: AssistantRole
  content: string
}

export type QuestionBankAssistantToolTrace = {
  step: number
  tool: string
  reason: string
  arguments: Record<string, unknown>
  resultPreview: string
  isError: boolean
}

type AssistantDecision =
  | {
      action: 'tool'
      tool: string
      arguments: Record<string, unknown>
      reason: string
    }
  | {
      action: 'final'
      answer: string
      usedTools?: string[]
    }

function normalizeMessageContent(value: unknown) {
  return String(value || '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

function normalizeAssistantMessages(messages: unknown) {
  if (!Array.isArray(messages)) {
    return [] as QuestionBankAssistantMessage[]
  }

  return messages
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const record = item as Record<string, unknown>
      const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null
      const content = normalizeMessageContent(record.content)
      if (!role || !content) {
        return null
      }
      return {
        role,
        content,
      } satisfies QuestionBankAssistantMessage
    })
    .filter((item): item is QuestionBankAssistantMessage => Boolean(item))
    .slice(-12)
}

function serializeConversation(messages: QuestionBankAssistantMessage[]) {
  if (!messages.length) {
    return '暂无历史对话。'
  }

  return messages
    .map((message, index) => {
      const speaker = message.role === 'assistant' ? '助手' : '用户'
      const content = message.content.length > 2000 ? `${message.content.slice(0, 2000)}...` : message.content
      return `${index + 1}. ${speaker}: ${content}`
    })
    .join('\n\n')
}

function serializeToolCatalog(tools: Array<Record<string, unknown>>) {
  return tools
    .map((tool) => {
      const name = String(tool.name || '')
      const description = String(tool.description || '')
      const inputSchema = tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : {}
      return `- ${name}: ${description}\n  输入: ${JSON.stringify(inputSchema)}`
    })
    .join('\n')
}

function serializeObservations(traces: QuestionBankAssistantToolTrace[]) {
  if (!traces.length) {
    return '还没有执行任何工具。'
  }

  return traces
    .map((trace) => {
      const preview = trace.resultPreview.length > 1800 ? `${trace.resultPreview.slice(0, 1800)}...` : trace.resultPreview
      return [
        `步骤 ${trace.step}`,
        `工具: ${trace.tool}`,
        `原因: ${trace.reason || '未说明'}`,
        `参数: ${JSON.stringify(trace.arguments)}`,
        `结果: ${preview}`,
      ].join('\n')
    })
    .join('\n\n')
}

function normalizeToolArguments(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeAssistantDecision(value: Record<string, unknown>, toolNames: Set<string>, finalOnly: boolean): AssistantDecision {
  const action = String(value.action || '').trim().toLowerCase()
  if (action === 'final') {
    const answer = normalizeMessageContent(value.answer)
    if (!answer) {
      throw new Error('助手没有返回 final.answer')
    }
    return {
      action: 'final',
      answer,
      usedTools: Array.isArray(value.usedTools) ? value.usedTools.map((item) => String(item || '').trim()).filter(Boolean) : [],
    }
  }

  if (finalOnly) {
    throw new Error('最终阶段必须返回 final 动作')
  }

  if (action !== 'tool') {
    throw new Error(`未知动作: ${action || 'empty'}`)
  }

  const tool = String(value.tool || '').trim()
  if (!toolNames.has(tool)) {
    throw new Error(`未知工具: ${tool || 'empty'}`)
  }

  return {
    action: 'tool',
    tool,
    reason: normalizeMessageContent(value.reason),
    arguments: normalizeToolArguments(value.arguments),
  }
}

function extractToolResultPreview(result: unknown) {
  if (!result || typeof result !== 'object') {
    return String(result || '')
  }

  const record = result as Record<string, unknown>
  const content = Array.isArray(record.content) ? record.content : []
  const textParts = content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return ''
      }
      const text = (item as Record<string, unknown>).text
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)

  if (textParts.length) {
    return textParts.join('\n').slice(0, 3000)
  }

  const structuredContent =
    record.structuredContent && typeof record.structuredContent === 'object' ? record.structuredContent : result
  return JSON.stringify(structuredContent, null, 2).slice(0, 3000)
}

async function requestAssistantDecision(params: {
  messages: QuestionBankAssistantMessage[]
  tools: Array<Record<string, unknown>>
  traces: QuestionBankAssistantToolTrace[]
  finalOnly: boolean
}) {
  const { messages, tools, traces, finalOnly } = params
  const systemPrompt = [
    '你是题库数据库 AI 助手。',
    '你的唯一事实来源是 MCP 工具返回的数据库结果，不能编造数据库里不存在的信息。',
    '如果用户的问题需要数据库事实，先调用工具；如果现有工具结果已经足够，再给最终回答。',
    '优先少量高命中的查询，避免无意义地重复调用工具。',
    '如果数据库里查不到，明确说明“数据库中未查到对应信息”。',
    '你必须只输出一个 JSON 对象，不要输出 markdown，不要输出解释。',
    finalOnly
      ? '本轮只允许输出 {"action":"final","answer":"...","usedTools":["tool_name"]}。'
      : '输出二选一：1) {"action":"tool","tool":"工具名","arguments":{},"reason":"为什么要查"} 2) {"action":"final","answer":"...","usedTools":["tool_name"]}。',
  ].join('\n')

  const prompt = [
    '当前对话：',
    serializeConversation(messages),
    '',
    '可用工具：',
    serializeToolCatalog(tools),
    '',
    '已执行工具观察：',
    serializeObservations(traces),
    '',
    finalOnly
      ? '请基于以上工具结果，直接输出最终回答 JSON。'
      : '请判断下一步是调用哪个工具，还是已经可以直接作答。',
  ].join('\n')

  const raw = await requestArkRawWithRetry({
    model: ARK_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
    temperature: 0,
  } as Record<string, unknown>)

  const parsed = JSON.parse(raw) as unknown
  const text = extractArkText(parsed)
  const jsonText = extractFirstJsonObject(text)
  if (!jsonText) {
    throw new Error(`助手规划输出不是 JSON: ${text.slice(0, 500)}`)
  }

  const decision = parseModelJsonObject(jsonText)
  const toolNames = new Set(tools.map((tool) => String(tool.name || '').trim()).filter(Boolean))
  return normalizeAssistantDecision(decision, toolNames, finalOnly)
}

export async function runQuestionBankAssistantChat(params: {
  messages: unknown
  maxToolSteps?: unknown
}) {
  const messages = normalizeAssistantMessages(params.messages)
  const latestUserMessage = [...messages].reverse().find((item) => item.role === 'user')
  if (!latestUserMessage) {
    throw new Error('至少需要一条用户消息')
  }

  const maxToolSteps = Math.max(1, Math.min(8, Number(params.maxToolSteps) || 6))
  const transport = new StreamableHTTPClientTransport(new URL('/api/mcp/question-bank', `http://127.0.0.1:${PORT}`))
  const client = new Client({
    name: 'question-bank-assistant',
    version: '1.0.0',
  })

  try {
    await client.connect(transport)
    const listedTools = await client.listTools()
    const tools = Array.isArray(listedTools.tools)
      ? listedTools.tools
          .filter((tool) => tool && typeof tool === 'object')
          .map((tool) => tool as Record<string, unknown>)
      : []

    const traces: QuestionBankAssistantToolTrace[] = []
    const usedTools = new Set<string>()

    for (let step = 1; step <= maxToolSteps; step += 1) {
      const decision = await requestAssistantDecision({
        messages,
        tools,
        traces,
        finalOnly: false,
      })

      if (decision.action === 'final') {
        for (const toolName of decision.usedTools || []) {
          usedTools.add(toolName)
        }
        return {
          answer: decision.answer,
          usedTools: [...usedTools],
          toolTraces: traces,
        }
      }

      try {
        const result = await client.callTool({
          name: decision.tool,
          arguments: decision.arguments,
        })
        usedTools.add(decision.tool)
        traces.push({
          step,
          tool: decision.tool,
          reason: decision.reason,
          arguments: decision.arguments,
          resultPreview: extractToolResultPreview(result),
          isError: Boolean((result as { isError?: unknown }).isError),
        })
      } catch (error) {
        traces.push({
          step,
          tool: decision.tool,
          reason: decision.reason,
          arguments: decision.arguments,
          resultPreview: error instanceof Error ? error.message : String(error),
          isError: true,
        })
      }
    }

    const finalDecision = await requestAssistantDecision({
      messages,
      tools,
      traces,
      finalOnly: true,
    })
    if (finalDecision.action !== 'final') {
      throw new Error('最终阶段没有返回 final 动作')
    }

    return {
      answer: finalDecision.answer,
      usedTools: [...new Set([...(finalDecision.usedTools || []), ...usedTools])],
      toolTraces: traces,
    }
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}
