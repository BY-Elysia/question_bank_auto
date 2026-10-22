# 接口索引

接口仍处于定义阶段；所有路径相对部署根地址。具体请求/响应和错误见 OpenAPI。

## 公开 API：用户与 Agent

| 方法 | 路径 | 操作 | 请求 → 响应 |
| --- | --- | --- | --- |
| GET | `/api/v1/me` | 获取当前用户 | — → 200 User |
| GET | `/api/v1/me/workspace` | 获取用户唯一工作区 | — → 200 Workspace |
| PUT | `/api/v1/me/workspace/runtime` | 设置容器运行目标状态 | RuntimeRequest → 202 WorkspaceRuntime |
| GET | `/api/v1/me/workspace/runtime` | 查询容器实际状态 | — → 200 WorkspaceRuntime |
| GET | `/api/v1/projects` | 列出项目 | — → 200 ProjectPage |
| POST | `/api/v1/projects` | 创建教材或试卷项目 | ProjectCreate → 201 Project |
| GET | `/api/v1/projects/{projectId}` | 获取项目 | — → 200 Project |
| PATCH | `/api/v1/projects/{projectId}` | 更新项目名称或归档状态 | ProjectUpdate → 200 Project |
| DELETE | `/api/v1/projects/{projectId}` | 软删除项目 | — → 204 无响应体 |
| POST | `/api/v1/projects/{projectId}/assets` | 上传原始资料或附件 | AssetUpload → 201 Asset |
| GET | `/api/v1/projects/{projectId}/assets` | 列出项目资产 | — → 200 AssetPage |
| GET | `/api/v1/assets/{assetId}` | 获取资产元信息 | — → 200 Asset |
| DELETE | `/api/v1/assets/{assetId}` | 删除未引用资产 | — → 204 无响应体 |
| GET | `/api/v1/assets/{assetId}/content` | 下载获授权的资产内容 | — → 200 字节/事件流 |
| POST | `/api/v1/projects/{projectId}/documents` | 创建空或预填文档 | DocumentCreate → 201 Document |
| GET | `/api/v1/projects/{projectId}/documents` | 列出项目文档 | — → 200 DocumentPage |
| GET | `/api/v1/documents/{documentId}` | 读取当前文档 | — → 200 Document |
| PUT | `/api/v1/documents/{documentId}/content` | 提交人工编辑后的完整文档 | DocumentContent → 200 Document |
| POST | `/api/v1/documents/{documentId}/validate` | 校验候选文档内容 | DocumentContent → 200 ValidationReport |
| GET | `/api/v1/documents/{documentId}/revisions` | 列出文档历史快照 | — → 200 RevisionPage |
| GET | `/api/v1/documents/{documentId}/revisions/{revision}` | 读取不可变历史版本 | — → 200 DocumentRevision |
| POST | `/api/v1/documents/{documentId}/restore` | 从历史版本创建新的当前版本 | RevisionRestore → 200 Document |
| GET | `/api/v1/documents/{documentId}/proposals` | 列出模型或组卷修改建议 | — → 200 ProposalPage |
| GET | `/api/v1/proposals/{proposalId}` | 读取候选修改与校验结果 | — → 200 Proposal |
| POST | `/api/v1/proposals/{proposalId}/decision` | 应用或拒绝候选修改 | ProposalDecision → 200 Proposal |
| POST | `/api/v1/projects/{projectId}/jobs` | 提交后台工作流 | JobCreate → 202 Job |
| GET | `/api/v1/projects/{projectId}/jobs` | 列出项目任务 | — → 200 JobPage |
| GET | `/api/v1/jobs/{jobId}` | 获取任务状态与结果 | — → 200 Job |
| POST | `/api/v1/jobs/{jobId}/cancel` | 请求合作式取消任务 | — → 202 Job |
| POST | `/api/v1/jobs/{jobId}/retry` | 从失败或取消任务创建重试任务 | JobRetry → 202 Job |
| GET | `/api/v1/jobs/{jobId}/steps` | 获取处理步骤 | — → 200 StepPage |
| GET | `/api/v1/jobs/{jobId}/events` | 分页回放任务事件 | — → 200 EventPage |
| GET | `/api/v1/jobs/{jobId}/events/stream` | 订阅可恢复的任务事件 | — → 200 字节/事件流 |
| GET | `/api/v1/jobs/{jobId}/invocations` | 查询任务模型调用用量 | — → 200 InvocationPage |
| POST | `/api/v1/publications` | 发布指定文档版本到题库 | PublicationCreate → 201 Publication |
| GET | `/api/v1/publications` | 列出当前用户的发布快照 | — → 200 PublicationPage |
| GET | `/api/v1/publications/{publicationId}` | 读取来源快照 | — → 200 Publication |
| DELETE | `/api/v1/publications/{publicationId}` | 撤回已发布快照 | — → 204 无响应体 |
| GET | `/api/v1/publications/{publicationId}/nodes` | 获取已发布结构节点 | — → 200 NodePage |
| POST | `/api/v1/library/questions/search` | 按确定性条件检索题库 | LibraryQuery → 200 QuestionPage |
| GET | `/api/v1/library/questions/{questionVersionId}` | 读取不可变题目版本 | — → 200 LibraryQuestion |
| GET | `/api/v1/ai/providers` | 列出获授权供应商及模型 | — → 200 ProviderCatalog |
| POST | `/api/v1/ai/credentials` | 加密保存用户模型凭证 | CredentialCreate → 201 Credential |
| GET | `/api/v1/ai/credentials` | 列出凭证元信息 | — → 200 CredentialList |
| PUT | `/api/v1/ai/credentials/{credentialId}/secret` | 轮换凭证密钥 | CredentialRotate → 200 Credential |
| DELETE | `/api/v1/ai/credentials/{credentialId}` | 撤销凭证 | — → 204 无响应体 |
| POST | `/api/v1/ai/model-profiles` | 创建模型用途配置 | ModelProfileCreate → 201 ModelProfile |
| GET | `/api/v1/ai/model-profiles` | 列出模型配置 | — → 200 ModelProfileList |
| GET | `/api/v1/ai/model-profiles/{profileId}` | 读取模型配置 | — → 200 ModelProfile |
| PUT | `/api/v1/ai/model-profiles/{profileId}` | 创建模型配置的新版本 | ModelProfileCreate → 200 ModelProfile |
| GET | `/api/v1/ai/configuration` | 读取用户 Skill 模型绑定 | — → 200 AiConfiguration |
| PUT | `/api/v1/ai/configuration` | 更新用户 Skill 模型绑定 | AiConfigurationUpdate → 200 AiConfiguration |
| GET | `/api/v1/ai/skills` | 列出核心 Skill 定义 | — → 200 SkillCatalog |
| GET | `/api/v1/ai/tools` | 列出可用 Tool 定义 | — → 200 ToolCatalog |
| GET | `/api/v1/ai/workflows` | 列出工作流定义 | — → 200 WorkflowCatalog |

## 内部 API：工作区容器

| 方法 | 路径 | 操作 | 请求 → 响应 |
| --- | --- | --- | --- |
| POST | `/internal/v1/leases/claim` | 领取分配给当前工作区的任务 | WorkerClaim → 200 Lease |
| POST | `/internal/v1/jobs/{jobId}/heartbeat` | 续约并读取取消状态 | Heartbeat → 200 HeartbeatResult |
| POST | `/internal/v1/jobs/{jobId}/artifacts` | 上传任务产物并登记暂存引用 | ArtifactUpload → 201 JobArtifact |
| POST | `/internal/v1/jobs/{jobId}/steps/commit` | 原子提交步骤结果与恢复检查点 | StepCommit → 200 Checkpoint |
| POST | `/internal/v1/jobs/{jobId}/complete` | 提交任务终态及候选结果 | JobComplete → 200 Job |
| POST | `/internal/v1/jobs/{jobId}/model-invocations` | 通过冻结配置调用外部模型 | ModelInvocationRequest → 200 ModelInvocationResponse |
| POST | `/internal/v1/jobs/{jobId}/tool-executions` | 执行当前 Skill 获授权的工具调用 | ToolExecutionRequest → 200 ToolResult |
| POST | `/internal/v1/jobs/{jobId}/artifacts/read` | 读取当前任务的暂存产物 | ArtifactReadRequest → 200 字节/事件流 |
