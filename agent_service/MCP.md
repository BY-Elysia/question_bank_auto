# MCP 集成说明

这份文档说明题库数据库能力是如何通过 MCP 接入 `agent_service` 的。

## 1. 这套 MCP 是干什么的

这里的 MCP 指的是：

- 当前项目 `backend` 把题库数据库能力包装成一个 MCP Server
- `agent_service` 再把这个 MCP Server 作为一个 skill 接进来

最终效果是：

- 大模型可以像调用普通工具一样调用题库查询能力
- 但真正的数据读取发生在 `backend`
- `agent_service` 自己不直接连题库数据库做查询

## 2. 总体结构

链路可以理解成：

1. 用户向 Aemeath 提问
2. Aemeath 决定要不要查题库
3. 如果要查题库，就调用 `question_bank_mcp` skill 暴露出来的工具
4. 这个 skill 通过 HTTP 调用 `backend` 的 MCP 路由
5. `backend` 内部的 MCP Server 执行数据库查询
6. 查询结果通过 MCP 返回给 agent
7. agent 再把结果整理成最终回复

所以 `question_bank_mcp` 本质上是一个“桥接层”。

## 3. agent 侧是怎么实现的

agent 侧核心文件是：

- `src/feishu_agent/skills/question_bank_mcp.py`
- `src/feishu_agent/mcp_http.py`

### 3.1 question_bank_mcp skill

`QuestionBankMcpSkill` 做了三件事：

1. 初始化一个 `McpHttpClient`
2. 在启动或首次使用时调用 `tools/list`
3. 把 MCP 工具转换成普通 `ToolSpec`

这样一来，在 `AgentHarness` 看来，它和飞书 skill 没区别，都是：

- 有 `get_tools()`
- 有 `get_guidance()`
- 有 `execute()`

### 3.2 MCP 工具是怎么变成 ToolSpec 的

MCP 返回的工具通常带有：

- `name`
- `description`
- `inputSchema`

`question_bank_mcp.py` 会把它们转换成：

- `ToolSpec.name`
- `ToolSpec.description`
- `ToolSpec.parameters`
- `requires_confirmation = False`

因为这套题库 MCP 现在是只读能力，所以不需要确认流。

### 3.3 执行时怎么调用

当模型调用某个题库工具时：

1. `QuestionBankMcpSkill.execute(...)` 收到 `tool_name + args`
2. 调用 `McpHttpClient.call_tool(...)`
3. 发一个 JSON-RPC 请求到 MCP HTTP 端点
4. 收到结果后返回给 harness

如果 MCP 返回错误或 `isError=true`：

- skill 会把它包装成 `ToolExecutionError`
- 再交给 harness 统一处理

## 4. MCP HTTP 客户端怎么实现

文件：

- `src/feishu_agent/mcp_http.py`

这个客户端做的事情很简单，就是发标准的 JSON-RPC 风格请求：

### 4.1 列工具

调用：

- `tools/list`

请求体大致是：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

### 4.2 调工具

调用：

- `tools/call`

请求体大致是：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_assignment_questions",
    "arguments": {
      "query": "期末试卷"
    }
  }
}
```

### 4.3 请求头

它会带：

- `Accept: application/json, text/event-stream`
- `Content-Type: application/json`

如果外部请求传了 `X-Ark-Api-Key`，也会继续透传过去。

## 5. backend 侧 MCP Server 怎么实现

backend 侧核心文件是：

- `backend/src/routes/question-bank-mcp-routes.ts`
- `backend/src/question-bank-mcp-server.ts`

### 5.1 HTTP 路由

`/api/mcp/question-bank` 是 MCP over HTTP 的入口。

这条路由里会：

1. 创建一个新的 `McpServer`
2. 创建 `StreamableHTTPServerTransport`
3. 把当前请求交给 MCP transport 处理

也就是说，这一层主要负责：

- 把 Express 请求接进 MCP SDK
- 做协议层转发

### 5.2 MCP Server 本体

真正的工具注册发生在：

- `createQuestionBankMcpServer()`

这里会用 `@modelcontextprotocol/sdk` 的 `McpServer`，然后反复调用：

- `server.registerTool(...)`

把题库能力注册成 MCP 工具。

## 6. 当前题库 MCP 暴露了什么工具

工具都注册在：

- `backend/src/question-bank-mcp-server.ts`

当前主要包括这些方向：

- `get_schema_overview`
  读取题库 schema 总览
- `list_textbooks`
  列来源文档
- `get_textbook_detail`
  查来源文档详情
- `list_chapters`
  查结构节点
- `resolve_assignment_question_reference`
  解析题目引用
- `search_assignment_questions`
  搜索题目
- `screen_assignment_question_candidates`
  对候选题做更细的筛选
- `get_assignment_question_detail`
  读题目详情
- `list_question_bank_papers`
  查试卷模板

这些工具大多是只读查询工具。

## 7. 数据库查询在哪执行

真正的 SQL 查询发生在 `backend` 里，不在 `agent_service`。

常见做法是：

1. `registerTool(...)` 定义输入 schema
2. 工具函数里调用 `getQuestionBankPoolInstance()`
3. 直接查询 `question_bank_auto` schema 下的表
4. 把结果包装成 MCP 标准返回

包装结果常用的是：

- `buildToolResult(...)`

它会返回：

- `content`
- `structuredContent`

这样既方便模型读文本，也方便程序结构化消费。

## 8. 为什么要用 MCP，而不是 agent 直接查数据库

这样拆的好处主要有几个：

### 8.1 解耦

题库数据库逻辑继续留在 `backend`，agent 不需要知道 SQL 细节。

### 8.2 统一工具暴露方式

对 agent 来说：

- 飞书能力是 skill
- 题库能力也是 skill

虽然底层一个走 CLI，一个走 MCP over HTTP，但上层编排统一。

### 8.3 更容易扩展

以后如果要把别的系统也接进来，也可以继续挂成新的 MCP server 或新的 skill。

## 9. 一次题库查询的完整流程

以“查一下当前数据库里有哪些期末试卷”为例：

1. 用户发消息
2. `AgentHarness` 组 prompt
3. 模型根据 guidance 判断应使用 `question_bank_mcp`
4. 模型发起某个题库工具调用
5. harness 找到这个工具属于 `QuestionBankMcpSkill`
6. `QuestionBankMcpSkill.execute(...)` 调 `McpHttpClient.call_tool(...)`
7. 请求到 `backend /api/mcp/question-bank`
8. backend 的 `McpServer` 找到对应 `registerTool(...)`
9. 执行 SQL
10. 返回 MCP 结果
11. agent 把结果回喂模型或直接组织回复
12. 回复用户

## 10. 和普通 Skill 的关系

`question_bank_mcp` 从编排视角看只是一个普通 skill。

区别只在于：

- 普通飞书 skill 的 `execute()` 最后调的是 `lark-cli`
- `question_bank_mcp` 的 `execute()` 最后调的是 MCP HTTP

所以你可以把它理解成：

- Skill 是 agent 的能力组织层
- MCP 是其中一种能力实现方式

## 11. 一句话总结

现在这套题库 MCP 的实现本质是：

“backend 用 MCP SDK 把数据库查询包装成标准工具，agent 再通过 `question_bank_mcp` skill 把这些 MCP 工具重新暴露给大模型使用。”
