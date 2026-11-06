# 题目工作台扩展（2026-11-07）

## 职责边界

- 前端功能模块按 `api / hooks / components` 分离：`review` 负责完整题目、单题修复与插题，`workspace` 负责教材基础信息，`profile` 管理模型配置与用量，`assistant` 管理对话。页面组件不直接发请求，后端类型只从 `shared/contracts.ts` 引入。
- 后端 `questions` 提供补题用例，复用 `JobsService` 调度、`Skills` 结构化提取、`TextbookAssets` 图片存储和 `BookRepository` 原子提交，不依赖文件路径或具体供应商。
- 后端 `profile` 通过 `SettingsRepository`、`UsageRepository` 管理配置与记录。服务器环境变量作为默认值；保存到私有工作区卷的配置覆盖默认值，不写进代码、浏览器存储或 API 返回值。切换供应商域名必须重新输入密钥。
- `HttpModelClient` 将工作流请求适配为 Chat Completions、Responses 或 Anthropic Messages。显式前缀缓存是方舟 Responses 能力，其他配置自动走普通请求。普通对话保留真实 user/assistant 角色；最近上下文按独立策略限额。
- `assistant` 使用 `ConversationRepository` 保存对话；后台执行与 HTTP 请求生命周期独立。`AssistantContextPort` 是未来数据库/RAG 读取适配口，目前注入空实现，无数据库访问或工具执行权限。未来写操作需要独立命令接口与授权策略，不能把数据库连接直接放进 UI 或模型适配器。

## 数据和任务行为

1. 补题图片先保存为所属工作区的辅助图片教材，返回 `202` 和持久化任务；后台读取 `question-insert/SKILL.md` 提取独立题目，保留原始输出诊断。
2. 验证题型、选项、答案来源后，将图片加入教材来源页，并在锚点题目前或后插入。文档、页码和任务提交标记在同一次仓储更新中保存；失败保留原文档和补题图片，可恢复任务。已提交任务具有幂等标记，避免进程中断后重复插题。
3. 选择/填空型练习按同一练习节内独立题目数量连续编号，其他题目接着计数；综合练习合并题型子目录的计数。`sourceLabel` 保留原题号，界面和 v1.1 导出共享编号规则。真正共享题干的小问仍是 GROUP。
4. 工作区任务锁、取消信号、状态按工作区/任务 ID 隔离。离开网页、注销或结束浏览器会话不会取消服务端任务。进程重启会标记未完成提取任务为 interrupted，用户可从检查点恢复；普通聊天的未完成回复标为失败，不伪装成功。
5. 教材元信息编辑使用版本检查和运行状态检查，更新展示和导出信息，不重跑提取。来源页和题目文档继续保留原结构。
6. 浏览器只请求正常预览图；预览失败才退回原 PNG，不再自动下载额外高清版本。图片放大不改变此策略。
7. Token 用量按持久化模型调用记录聚合，章节与补题子教材归并到所属工作区，对话单列。统计供应商返回的输入、输出、缓存命中及总量；新的前缀种子返回用量计入一次。未返回 usage 的调用单独标注，历史记录未保存的种子消耗无法追溯，不能将该统计当成供应商账单。

## 新增 API

- `PATCH /api/workspaces/:id/metadata`：基础信息和预期 revision。
- `POST /api/workspaces/:id/questions/:anchor/image?position=before|after&revision=N`：单张 images multipart，返回插题任务。
- `GET/PUT /api/profile/model`、`POST /api/profile/model/test`：读写脱敏配置、连接测试。
- `GET /api/profile/usage`：工作区与对话调用用量。
- `GET/POST /api/assistant/conversations`、`GET /api/assistant/conversations/:id`、`POST /api/assistant/conversations/:id/messages`：对话持久化与后台回复。

当前仍为已有的单账号部署，并非多租户账号系统；所有新增接口继续经过同一个登录门禁。未来多账号化时，应将账号作用域传入仓储与模型配置解析口，替换基础设施适配器，不在页面中拼接存储路径。

补题输出还经过 `independentQuestions` 领域归一化：仅将没有公共答案、选项或实质题干的题型标题拆成独立题；独立题省略的空 `children` 可安全补为 `[]`。这些是可确定的结构差异，不额外调用模型重写题干，避免重复生成引入导数符号等新的识别误差。已知共享条件的题组不拆分。

协议参考：[Anthropic Messages API](https://platform.claude.com/docs/en/api/http/messages)。当前三种协议的传输契约均有本地 HTTP 测试，生产凭据的真实验证使用现有方舟 Responses 服务；不声称已验证所有第三方模型。

## 2026-11-07 维护性审查后的职责边界

- `shared/concurrency/KeyedLock` 统一同一实体的串行写入。教材、工作区、对话、Skill 固定版本记录复用实现；不同实体仍可并行，前一次写入失败不会阻塞后续写入。
- `shared/concurrency/BackgroundTasks` 统一执行句柄、取消、等待和关闭；任务状态、检查点、失败解释仍由各自用例负责。工作区、教材任务、助手服务复用它。它不是跨进程任务队列，现有文件仓储仍由单后端进程管理。
- `JobHandler.isCommitted` 由处理器提供最终结果提交判定。任务恢复和取消不再在调度器里硬编码补题完成条件，补题事务与幂等性仍归 `QuestionInsertion`。
- `AssistantService` 管理消息和后台任务，`AssistantReply` 编排上下文、Skill、模型及用量记录。`AppOptions` 可注入配置、用量、对话仓储和助手上下文端口；未来数据库/RAG 接入从这些边界扩展。
- `MetadataFields` 统一教材配置与编辑的六个基础字段、标签及长度限制。页面保留各自提交流程与答案处理语义。
- `useResource` 更换数据来源时清除旧数据和错误，保留同一来源轮询的对象身份与请求合并。助手 GET、个人中心 GET 传递取消信号；对话草稿按对话 ID 隔离，延迟发送结果不清空其他草稿；个人中心刷新不覆盖未保存配置。

API 路径、导出格式、工作区文件格式均保持兼容。本次没有迁移历史教材或重新生成答案。回归覆盖并发隔离、已提交补题取消、对话切换及未保存配置保护，保留原有提取、公式、图片、布局与完整题目测试。
