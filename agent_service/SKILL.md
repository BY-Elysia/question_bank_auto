# Skill 机制说明

这份文档说明 `agent_service` 里的 `Skill` 是什么、怎么被加载、以及一次用户请求里 `Skill` 参与处理的方式。

## 1. Skill 是什么

在这套 agent 里，`Skill` 可以理解成“能力分组”。

一个 `Skill` 负责三件事：

1. 告诉大模型自己有哪些工具可用。
2. 告诉大模型这些工具什么时候该用。
3. 在大模型真正发起工具调用时执行对应逻辑。

抽象接口定义在：

- `src/feishu_agent/skills/base.py`

核心接口有三组：

- `get_tools()`: 返回这个 skill 暴露给模型的工具列表。
- `get_guidance()`: 返回给模型看的文字说明。
- `execute(tool_name, args, context)`: 真正执行工具。

其中工具结构由 `ToolSpec` 定义，包含：

- `name`
- `description`
- `parameters`
- `requires_confirmation`

## 2. 当前有哪些 Skill

当前默认启用的 skill 在：

- `src/feishu_agent/skills/__init__.py`

默认包括：

- `conversation`
- `feishu_contact`
- `feishu_im`
- `feishu_calendar`
- `feishu_docs`
- `feishu_search`
- `question_bank_mcp`

实际启用哪些能力由环境变量控制：

- `ENABLED_SKILLS`

如果 `.env` 里没有显式设置，就会使用默认 skill 集合。

## 3. Skill 怎么被加载

加载入口在：

- `src/feishu_agent/harness.py`

`AgentHarness` 初始化时会：

1. 从配置里读取 `enabled_skills`
2. 调用 `load_skills(...)`
3. 通过 `SKILL_FACTORIES` 创建 skill 实例
4. 汇总所有 skill 的工具，建立工具注册表

也就是说，`Skill` 不是运行时临时扫描目录，而是显式注册、显式启用。

## 4. 大模型怎么知道有哪些 Skill

模型并不知道 Python 代码本身，它知道的是我们喂给它的两类信息。

### 4.1 Skill guidance

每个 skill 的 `get_guidance()` 会返回一段文字说明。

这些说明会在构造 prompt 时被拼进去，告诉模型：

- 这个 skill 是做什么的
- 什么时候优先使用
- 使用时有哪些约束

例如：

- `conversation` 负责普通闲聊
- `question_bank_mcp` 负责题库数据库查询

### 4.2 Tool schema

每个 skill 的 `get_tools()` 会返回工具定义。

这些 `ToolSpec` 会被转换成 Responses API 的 `function tools`，再传给模型。

模型最终看到的是：

- 工具名
- 工具描述
- 输入参数 schema
- 是否严格校验

所以模型不是“理解了 skill 类”，而是：

- 通过 guidance 知道“什么时候用”
- 通过 tool schema 知道“能怎么用”

## 5. 一次请求里 Skill 怎么参与处理

一次请求的大致流程是：

1. 用户消息进入 `AgentHarness.handle_message(...)`
2. harness 读取当前会话历史
3. harness 拼 prompt
4. harness 收集所有 skill 暴露的工具
5. 调用 Ark Responses API
6. 如果模型返回 `function_call`
7. harness 根据工具名找到所属 skill
8. 调用 `skill.execute(...)`
9. 把工具结果再喂回模型或直接返回结果

如果工具需要确认：

- 不会立刻执行
- 会先生成 `pending_action`
- 等前端或飞书侧确认后再真正执行

## 6. Skill 和 ToolExecutor 的关系

不是所有 skill 都自己直接调外部系统。

例如飞书相关 skill，通常会把实际执行交给：

- `src/feishu_agent/tool_executor.py`
- `src/feishu_agent/cli_runner.py`

它们负责：

- 调 `lark-cli`
- 解析 stdout/stderr
- 统一映射错误类型
- 记录工具日志

而像 `question_bank_mcp` 这样的 skill，则不是走 `lark-cli`，而是走 MCP over HTTP。

## 7. conversation skill 的特殊性

`conversation` 是一个特殊 skill：

- 它没有工具
- 只提供 guidance

它的作用是告诉模型：

- 普通聊天时直接回答
- 不要把普通寒暄误判成飞书操作

所以它更像“行为约束层”，而不是“执行层”。

## 8. 如何新增一个 Skill

如果后面要加新的能力，通常按这个步骤：

1. 在 `src/feishu_agent/skills/` 下新增一个 skill 文件
2. 继承 `Skill`
3. 实现 `get_tools()`
4. 实现 `get_guidance()`
5. 实现 `execute()`
6. 在 `skills/__init__.py` 里注册到 `SKILL_FACTORIES`
7. 把名字加入 `ENABLED_SKILLS` 或默认列表

## 9. 设计上的好处

这种设计的好处是：

- 聊天人格和工具能力解耦
- 飞书、MCP、普通聊天都能统一走一套编排
- 新能力可以按 skill 继续扩展
- 不同 skill 可以有不同的 guidance 和执行方式

## 10. 一句话总结

`Skill` 是这套 agent 的“能力插件层”：

- guidance 负责告诉模型什么时候用
- tools 负责告诉模型可以怎么用
- execute 负责把模型的工具调用真正落地
