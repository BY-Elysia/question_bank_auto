# 后端接口清单（v2 基线）

整理日期：2026-11-07。来源：当前 OpenAPI 构建产物及认证中间件。64 个业务/健康端点，另有 3 个登录会话端点。下一版助手提案见 [架构与规划](planning/assistant-next.md)。

新增 P1 资料范围与来源接口见 [教材查询与引用](assistant-knowledge.md#新增-http-接口)。

## 通用约定

- 前缀 `/api`；启用登录后使用 HttpOnly Cookie。
- `202` 表示任务已接收，业务结果通过状态查询获取。
- 运行时使用 Zod 校验；冲突通常返回 `409`，错误使用 problem+json。OpenAPI 通用错误模板尚未逐项覆盖认证错误和全部运行时错误，调用方也需处理 `401/403/422` 等实际响应。
- 以下契约名称对应 `dist/contracts/openapi.json` 的 components.schemas；二进制资源标为 inline/binary。详细字段、必填项和枚举以 schema 为准。

## 登录与会话（中间件）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/access/session` | 查询是否启用登录及当前认证状态 |
| POST | `/api/access/login` | `{username,password}`；成功设置会话 Cookie |
| POST | `/api/access/logout` | 撤销会话并清除 Cookie |

## textbooks

| 方法 / 路径 | 用例 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| `GET /api/textbooks` | `listTextbooks` | — | 200 BookList |
| `POST /api/textbooks` | `uploadTextbook` | application/pdf: inline/binary | 201 Book |
| `GET /api/textbooks/{id}` | `getTextbook` | — | 200 Book |
| `DELETE /api/textbooks/{id}` | `deleteTextbook` | — | 204 无正文 |
| `GET /api/textbooks/{id}/source` | `downloadSource` | — | 200 inline/binary |
| `GET /api/textbooks/{id}/pages/{page}/image` | `getPageImage` | — | 200 inline/binary/inline/binary; 304 无正文 |
| `GET /api/textbooks/{id}/document` | `getDocument` | — | 200 DocumentResponse |
| `PUT /api/textbooks/{id}/document` | `replaceDocument` | application/json: ReplaceDocument | 200 Book |
| `PATCH /api/textbooks/{id}/contents/{contentId}` | `editContent` | application/json: EditContent | 200 Book |
| `GET /api/textbooks/{id}/proposals` | `listProposals` | — | 200 ProposalList |
| `POST /api/textbooks/{id}/proposals/{proposalId}/decision` | `decideProposal` | application/json: Decision | 200 Book |
| `POST /api/textbooks/{id}/validate` | `validateDocument` | — | 200 Validation |
| `GET /api/textbooks/{id}/revisions` | `listRevisions` | — | 200 Revisions |
| `POST /api/textbooks/{id}/restore` | `restoreRevision` | application/json: Restore | 200 Book |
| `GET /api/textbooks/{id}/export.json` | `exportJson` | — | 200 QuestionBankExport |
| `GET /api/textbooks/{id}/content.json` | `exportContent` | — | 200 ExportDocument |
| `GET /api/textbooks/{id}/export.zip` | `exportZip` | — | 200 inline/binary |
| `POST /api/textbooks/{id}/jobs` | `createJob` | application/json: JobRequest | 202 Job |
| `GET /api/textbooks/{id}/jobs` | `listJobs` | — | 200 JobList |
| `GET /api/textbooks/{id}/jobs/{jobId}` | `getJob` | — | 200 Job |
| `POST /api/textbooks/{id}/jobs/{jobId}/cancel` | `cancelJob` | — | 200 Job |
| `POST /api/textbooks/{id}/jobs/{jobId}/resume` | `resumeJob` | — | 202 Job |

参数：
- `POST /api/textbooks`：`title`（query，必填）
- `GET /api/textbooks/{id}/pages/{page}/image`：`variant`（query，可选）

## workspaces

| 方法 / 路径 | 用例 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| `GET /api/workspaces/{id}/readiness` | `getWorkspaceReadiness` | — | 200 WorkspaceReadiness |
| `DELETE /api/workspaces/{id}` | `deleteWorkspace` | — | 204 无正文 |
| `GET /api/workspaces/{id}` | `getWorkspace` | — | 200 WorkspaceViewResponse |
| `GET /api/workspaces` | `listWorkspaces` | — | 200 WorkspaceList |
| `POST /api/workspaces/pdf` | `uploadWorkspacePdf` | application/pdf: inline/binary | 202 Workspace |
| `POST /api/workspaces/images` | `uploadWorkspaceImages` | multipart/form-data: inline/binary | 201 Workspace |
| `POST /api/workspaces/{id}/extract` | `extractWorkspace` | application/json: ExtractionSettings | 202 Workspace |
| `POST /api/workspaces/{id}/resume` | `resumeWorkspace` | — | 202 Workspace |
| `POST /api/workspaces/{id}/cancel` | `cancelWorkspace` | — | 200 Workspace |
| `PATCH /api/workspaces/{id}/metadata` | `updateWorkspaceMetadata` | application/json: MetadataUpdate | 200 Workspace |
| `POST /api/workspaces/{id}/questions/{anchor}/image` | `insertQuestionImage` | multipart/form-data: inline/binary | 202 Job |

参数：
- `GET /api/workspaces/{id}`：`preview`（query，可选）
- `POST /api/workspaces/pdf`：`title`（query，必填）
- `POST /api/workspaces/images`：`title`（query，必填）
- `POST /api/workspaces/{id}/questions/{anchor}/image`：`position`（query，必填）；`revision`（query，必填）

## assistant

| 方法 / 路径 | 用例 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| `GET /api/assistant/model` | `getAssistantModelSettings` | — | 200 ModelSettingsView |
| `PUT /api/assistant/model` | `saveAssistantModelSettings` | application/json: ModelSettingsInput | 200 ModelSettingsView |
| `POST /api/assistant/model/test` | `testAssistantModelSettings` | application/json: ModelSettingsInput | 201 ModelTestResult |
| `GET /api/assistant/conversations` | `listConversations` | — | 200 ConversationList |
| `POST /api/assistant/conversations` | `createConversation` | — | 201 Conversation |
| `GET /api/assistant/conversations/{id}` | `getConversation` | — | 200 Conversation |
| `POST /api/assistant/conversations/{id}/messages` | `sendMessage` | application/json: ChatInput | 202 Conversation |

| `GET /api/assistant/conversations/{id}/state` | `getAssistantState` | — | 200 AssistantState |
| `PATCH /api/assistant/conversations/{id}` | `renameConversation` | RenameConversation | 200 Conversation |
| `DELETE /api/assistant/conversations/{id}` | `deleteConversation` | — | 204 |
| `GET /api/assistant/conversations/{id}/messages` | `getConversationMessages` | cursor / limit 查询参数 | 200 MessagePage |
| `POST /api/assistant/conversations/{id}/runs` | `startAssistantRun` | StartRun | 202 AssistantRunView |
| `GET /api/assistant/runs/{id}` | `getAssistantRun` | — | 200 AssistantRunView |
| `POST /api/assistant/runs/{id}/inputs` | `inputAssistantRun` | InputCommand | 202 AssistantRunView |
| `POST /api/assistant/runs/{id}/cancel` | `cancelAssistantRun` | — | 201 AssistantRunView |
| `POST /api/assistant/runs/{id}/resume` | `resumeAssistantRun` | — | 202 AssistantRunView |
| `POST /api/assistant/runs/{id}/retry` | `retryAssistantRun` | — | 202 AssistantRunView |
| `POST /api/assistant/runs/{id}/interactions/{interactionId}/responses` | `answerAssistantInteraction` | InteractionAnswer | 202 AssistantRunView |
| `GET /api/assistant/runs/{id}/events` | `streamAssistantEvents` | after / Last-Event-ID | 200 text/event-stream |


## profile

| 方法 / 路径 | 用例 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| `GET /api/profile/model` | `getModelSettings` | — | 200 ModelSettingsView |
| `PUT /api/profile/model` | `saveModelSettings` | application/json: ModelSettingsInput | 200 ModelSettingsView |
| `POST /api/profile/model/test` | `testModelSettings` | application/json: ModelSettingsInput | 201 ModelTestResult |
| `GET /api/profile/usage` | `getModelUsage` | — | 200 UsageSummary |


## health

| 方法 / 路径 | 用例 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| `GET /api/health` | `health` | — | 200 Health |


## 助手核心请求示例

```http
POST /api/assistant/conversations
```

返回会话后：

```http
POST /api/assistant/conversations/{id}/messages
Content-Type: application/json

{"text":"请解释导数的几何意义"}
```

该旧发送接口保持兼容。新客户端通过 `POST conversations/{id}/runs` 提交 `{text,requestId}`，订阅 `GET runs/{id}/events` 获得流式文字与状态。插话提交 `{text,requestId,mode}`，mode 为 steer / interrupt / follow_up。结构化问题通过 interactionId 提交 `{answer}`。状态接口提供最新 Run、最近 50 条消息与 nextCursor，消息接口按 cursor 向更早历史分页。恢复原 Run 用 resume，重新生成用 retry。完整语义见 [助手 Harness](assistant-harness.md)。

配置读取不返回 apiKey；保存留空会保留同一服务域名的已有密钥，切换域名需提供新密钥。P0 不含附件或数据库工具。

## 可视化助手修改接口（v2.3）

`GET /api/workspaces/{id}/changes` 返回最近变更，`POST /api/workspaces/{id}/changes/{change}/undo` 接收 `{revision}` 执行逐题撤销。scope 新增 allowEdits，默认 false。详细权限与执行链路见 [可视化助手架构](embedded-review-assistant.md)。
