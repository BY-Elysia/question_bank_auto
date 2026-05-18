# Aemeath Agent Sidecar

这个目录是集成进当前仓库的 Python sidecar。它不接管题库主流程，只负责三类辅助能力：

- 普通聊天
- 通过 `lark-cli` 控制飞书
- 通过当前项目暴露的题库 MCP 查询数据库

正常题库页面、PDF 流程、结构化流程、修题、补图、可视化、数据库导入都继续由现有前后端负责。

## 架构

- `harness`
  统一处理会话、模型调用、工具编排、确认流和 trace。
- `skills`
  保留飞书能力拆分，并新增 `question_bank_mcp`。
- `tool_executor`
  负责把飞书工具翻译成受控的 `lark-cli` 调用。
- `store`
  持久化消息、待确认动作和工具日志。

## 当前 Skills

- `conversation`
- `feishu_contact`
- `feishu_im`
- `feishu_calendar`
- `feishu_docs`
- `feishu_search`
- `question_bank_mcp`

`question_bank_mcp` 只用于题库数据库查询，能力范围包括：

- 教材
- 试卷
- 结构节点
- 题目检索
- 题目详情查询

## HTTP 接口

- `GET /healthz`
- `GET /identity`
- `POST /chat`
- `POST /actions/{id}/confirm`

`/chat` 和确认接口都会返回统一的 `trace`，供前端展示 harness / skill / tool 轨迹。

写操作仍保留确认流：

- `send_dm`
- `create_doc`

这两个工具不会直接自动执行，必须先进入 pending action，再由前端确认或取消。

## 环境变量

先复制一份示例配置：

```powershell
Copy-Item .env.example .env
```

核心字段如下：

```dotenv
ARK_API_KEY=replace-with-your-ark-api-key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=replace-with-your-endpoint-id
LARK_CLI_BIN=lark-cli
AEMEATH_AGENT_BASE_URL=http://127.0.0.1:8000
QUESTION_BANK_MCP_URL=http://127.0.0.1:5001/api/mcp/question-bank
QUESTION_BANK_MCP_TIMEOUT_SECONDS=30
AGENT_PERSONA=aemeath
ENABLED_SKILLS=conversation,feishu_contact,feishu_im,feishu_calendar,feishu_docs,feishu_search,question_bank_mcp
```

说明：

- `QUESTION_BANK_MCP_URL`
  指向当前 Node 后端暴露的题库 MCP。
- `AEMEATH_AGENT_BASE_URL`
  sidecar 自身对外服务地址。代码也兼容旧变量 `FEISHU_AGENT_BASE_URL`。
- `ENABLED_SKILLS`
  控制加载哪些技能；默认已经包含 `question_bank_mcp`。

## 安装

```powershell
cd agent_service
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

## 运行

先启动当前项目的 Node 后端，让题库 MCP 可访问；再单独启动 sidecar：

```powershell
cd agent_service
.venv\Scripts\activate
python -m uvicorn feishu_agent.app:create_app --factory --host 127.0.0.1 --port 8000
```

如果你更习惯脚本入口，也可以：

```powershell
cd agent_service
.venv\Scripts\activate
feishu-agent
```

## 与当前前端的关系

当前前端不再调用旧的题库 AI 助手接口，而是统一走：

- `GET /api/agent/bootstrap`
- `POST /api/agent/chat`
- `POST /api/agent/actions/:actionId/confirm`

这些接口由当前 Node 后端代理到本 sidecar。

## 备注

- sidecar 是辅助模块，不启动也不影响题库主系统。
- 如果本地没装依赖或没装 `lark-cli`，聊天页会显示 Agent 不可用或对应技能不可用。
- 请求头 `X-Ark-Api-Key` 支持按请求覆盖模型调用，并会继续透传给题库 MCP。
