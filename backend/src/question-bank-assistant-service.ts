import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { getArkApiKeyOverride } from './ark-request-context'
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

type QuestionQueryMode = 'reference_lookup' | 'semantic_search' | 'general'

function normalizeMessageContent(value: unknown) {
  return String(value || '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

function detectQuestionQueryMode(content: string): QuestionQueryMode {
  const text = normalizeMessageContent(content)
  if (!text) {
    return 'general'
  }

  if (
    /\bq_\d+(?:_\d+){2,3}\b/i.test(text) ||
    /习题\s*\d+\s*[._．。]\s*\d+/.test(text) ||
    /(?:第\s*[零一二两三四五六七八九十百千\d]+\s*小题)/.test(text) ||
    /(?:第\s*[零一二两三四五六七八九十百千\d]+\s*题)/.test(text)
  ) {
    return 'reference_lookup'
  }

  if (
    /(找一道|找一题|来一道|来一题|推荐|筛选|类似|相关题|同类题|中等难度|偏难|简单|是不是|有没有.*题|哪道题)/.test(
      text,
    )
  ) {
    return 'semantic_search'
  }

  return 'general'
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

  if (structuredContent && typeof structuredContent === 'object') {
    const structured = structuredContent as Record<string, unknown>
    const question =
      structured.question && typeof structured.question === 'object'
        ? (structured.question as Record<string, unknown>)
        : null

    if (question) {
      const blockText = (value: unknown) =>
        value && typeof value === 'object' ? String((value as Record<string, unknown>).text || '').trim() : ''

      const children = Array.isArray(question.children) ? question.children : []
      const summary = {
        schema: structured.schema,
        question: {
          questionCode: question.questionCode,
          nodeType: question.nodeType,
          questionType: question.questionType,
          title: question.title,
          chapterTitle: question.chapterTitle,
          textbookId: question.textbookId,
          documentType: question.documentType,
          examType: question.examType,
          hasAnswer: question.hasAnswer,
          stemText: blockText(question.stem),
          promptText: blockText(question.prompt),
          standardAnswerText: blockText(question.standardAnswer),
          children: children.slice(0, 12).map((item) => {
            const child = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
            return {
              questionCode: child.questionCode,
              title: child.title,
              promptText: blockText(child.prompt),
              standardAnswerText: blockText(child.standardAnswer),
              defaultScore: child.defaultScore,
            }
          }),
        },
      }
      return JSON.stringify(summary, null, 2).slice(0, 7000)
    }
  }

  return JSON.stringify(structuredContent, null, 2).slice(0, 3000)
}

function extractToolStructuredContent(result: unknown) {
  if (!result || typeof result !== 'object') {
    return null
  }
  const record = result as Record<string, unknown>
  return record.structuredContent && typeof record.structuredContent === 'object'
    ? (record.structuredContent as Record<string, unknown>)
    : null
}

function extractSingleResolvedQuestionMatch(result: unknown) {
  const structured = extractToolStructuredContent(result)
  const matches = Array.isArray(structured?.matches) ? structured.matches : []
  if (matches.length !== 1) {
    return null
  }

  const first = matches[0]
  if (!first || typeof first !== 'object') {
    return null
  }

  const record = first as Record<string, unknown>
  const questionCode = String(record.questionCode || '').trim()
  const textbookId = String(record.textbookId || '').trim()
  if (!questionCode) {
    return null
  }

  return {
    questionCode,
    textbookId: textbookId || undefined,
  }
}

async function requestAssistantDecision(params: {
  messages: QuestionBankAssistantMessage[]
  tools: Array<Record<string, unknown>>
  traces: QuestionBankAssistantToolTrace[]
  finalOnly: boolean
  queryMode: QuestionQueryMode
}) {
  const { messages, tools, traces, finalOnly, queryMode } = params
  const queryModeInstruction =
    queryMode === 'reference_lookup'
      ? '当前用户更像是在定位一道固定题。优先调用 resolve_assignment_question_reference，把“习题10.2第2题 / 第1小题 / q_10_2_2”解析成精确 questionCode，再调用 get_assignment_question_detail。除非解析失败，不要先走 screen_assignment_question_candidates。'
      : queryMode === 'semantic_search'
        ? '当前用户更像是在让你推荐、筛选或判断某类题。优先调用 screen_assignment_question_candidates，需要完整题干或答案时再调用 get_assignment_question_detail。'
        : '如果用户指向固定题（如“习题10.2第2题”“第1小题”“q_10_2_2”），先调用 resolve_assignment_question_reference；如果用户是在找符合条件的题或做语义判断，再调用 screen_assignment_question_candidates。'
  const systemPrompt = [
    '你是题库数据库 AI 助手。',
    '你的唯一事实来源是 MCP 工具返回的数据库结果，不能编造数据库里不存在的信息。',
    '如果用户的问题需要数据库事实，先调用工具；如果现有工具结果已经足够，再给最终回答。',
    '优先少量高命中的查询，避免无意义地重复调用工具。',
    '优先使用明确业务工具：来源文档列表、来源详情、结构节点列表、题目引用解析、题目搜索、候选题筛选、题目详情、试卷模板列表。',
    '如果不清楚表结构或字段，先调用 get_schema_overview，不要猜数据库结构。',
    'MCP 工具里保留了 textbookId 这个旧参数名，但它现在表示“来源文档 external_id”，既可能是教材，也可能是试卷。',
    '当需要区分教材和试卷时，优先传 documentType=textbook 或 documentType=exam。',
    '题库里常见 questionCode 形如 q_10_2_2 或 q_10_2_2_1；GROUP 表示母题，children 表示该题下的小题。',
    '回答某一道题的答案、题干或评分规则时，优先调用 get_assignment_question_detail。',
    '如果返回的 documentType=exam，chapterTitle 代表试卷中的结构节点，不一定是教材小节。',
    '当用户提到固定题引用时，优先调用 resolve_assignment_question_reference，不要把固定题定位问题误走成语义筛题。',
    '遇到“是不是某类题”“难度中等/偏难/简单”“疑似某主题题目”这类语义判断时，优先调用 screen_assignment_question_candidates，不要把 questionType 当成唯一依据。',
    'search_assignment_questions 适合做宽召回；如果 questionType 不是用户明确指定的数据库字段值，就不要传 questionType 参数。',
    '如果 get_assignment_question_detail 返回的题目 nodeType 是 GROUP，最终回答要同时覆盖母题题干和 children 里的全部小题，不要只回答第一小题，也不要把 preview 被截断误判成数据库缺失。',
    '如果数据库里查不到，明确说明“数据库中未查到对应信息”。',
    '你必须只输出一个 JSON 对象，不要输出 markdown，不要输出解释。',
    queryModeInstruction,
    finalOnly
      ? '本轮只允许输出 {"action":"final","answer":"...","usedTools":["tool_name"]}。'
      : '输出二选一：1) {"action":"tool","tool":"工具名","arguments":{},"reason":"为什么要查"} 2) {"action":"final","answer":"...","usedTools":["tool_name"]}。',
  ].join('\n')

  const prompt = [
    '当前对话：',
    serializeConversation(messages),
    '',
    `查询模式提示：${queryMode}`,
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
  const queryMode = detectQuestionQueryMode(latestUserMessage.content)

  const maxToolSteps = Math.max(1, Math.min(8, Number(params.maxToolSteps) || 6))
  const arkApiKey = getArkApiKeyOverride()
  const transport = new StreamableHTTPClientTransport(new URL('/api/mcp/question-bank', `http://127.0.0.1:${PORT}`), {
    requestInit: arkApiKey
      ? {
          headers: {
            'X-Ark-Api-Key': arkApiKey,
          },
        }
      : undefined,
  })
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
    let nextStep = 1

    if (queryMode === 'reference_lookup' && nextStep <= maxToolSteps) {
      const resolveArguments = {
        reference: latestUserMessage.content,
      }

      try {
        const resolveResult = await client.callTool({
          name: 'resolve_assignment_question_reference',
          arguments: resolveArguments,
        })
        usedTools.add('resolve_assignment_question_reference')
        traces.push({
          step: nextStep,
          tool: 'resolve_assignment_question_reference',
          reason: '用户在查询固定题，先解析题目引用到精确 questionCode。',
          arguments: resolveArguments,
          resultPreview: extractToolResultPreview(resolveResult),
          isError: Boolean((resolveResult as { isError?: unknown }).isError),
        })
        nextStep += 1

        const resolved = extractSingleResolvedQuestionMatch(resolveResult)
        if (resolved && nextStep <= maxToolSteps) {
          const detailArguments: Record<string, unknown> = {
            questionCode: resolved.questionCode,
          }
          if (resolved.textbookId) {
            detailArguments.textbookId = resolved.textbookId
          }

          const detailResult = await client.callTool({
            name: 'get_assignment_question_detail',
            arguments: detailArguments,
          })
          usedTools.add('get_assignment_question_detail')
          traces.push({
            step: nextStep,
            tool: 'get_assignment_question_detail',
            reason: '题目引用已唯一解析，继续读取该题完整详情。',
            arguments: detailArguments,
            resultPreview: extractToolResultPreview(detailResult),
            isError: Boolean((detailResult as { isError?: unknown }).isError),
          })
          nextStep += 1
        }
      } catch (error) {
        traces.push({
          step: nextStep,
          tool: 'resolve_assignment_question_reference',
          reason: '用户在查询固定题，先解析题目引用到精确 questionCode。',
          arguments: resolveArguments,
          resultPreview: error instanceof Error ? error.message : String(error),
          isError: true,
        })
        nextStep += 1
      }
    }

    for (let step = nextStep; step <= maxToolSteps; step += 1) {
      const decision = await requestAssistantDecision({
        messages,
        tools,
        traces,
        finalOnly: false,
        queryMode,
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
      queryMode,
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
