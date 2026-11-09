# 架构复审：教材助手与审核边界

本轮围绕 2.3.0 新增的可视化助手闭环检查依赖方向、任务生命周期、资源加载和修改归属，保留现有接口及业务行为。

## 发现与重构

| 发现 | 归属与处理 |
| --- | --- |
| 助手适配器直接访问教材存储、启动任务、接受候选、撤销修改 | `review/application/QuestionOperationService` 统一编排；助手通过 `review/ports/QuestionOperations` 调用 |
| 审核 HTTP 接口反向依赖助手知识服务获取权限 | 注入 `catalog/ports/WorkspaceAccess`，由组合根绑定请求账号的 `AccessPolicy` |
| 知识服务依赖具体查询实现 | 改为 `CatalogQueries` 端口，查询、索引及存储实现由组合根装配 |
| 应用层读取 Node 流并编码图片 | `SourceImageReader` 定义模型图片契约，`PageSourceImageReader` 在基础设施层处理预览图流与编码 |
| 来源快照格式化混在会话权限逻辑里 | 提取纯函数 `evidenceExcerpt`，保留原题、子题、选项和答案来源语义 |
| 独立聊天页兼任教材侧栏，靠隐藏历史 UI 复用 | 独立 `AssistantPage` 与 `ReviewAssistantPanel`，共用 `ConversationView`；历史管理独立为 `ConversationHistory` |
| 侧栏启动仍请求历史和资料选择器、修改记录首屏重复刷新 | 侧栏关闭历史资源加载，不挂载资料选择器 hook；修改记录以工作区与修订号为唯一刷新依赖 |
| 一个 Run 的后续任务返回此前任务的修改记录 | 按当前 Job 的候选 ID 收集已提交修改，准确返回 applied / unchanged |
| 删除教材后取消对话可能被不存在的资源打断 | 取消用例将已删除资源视为已清理；其他错误继续传播；中止任务的异步取消被完整等待 |

## 调用层级

```text
独立聊天页 / 教材侧栏
  → 会话 hook、教材绑定 hook
  → typed API
  → HTTP Controller / Assistant Tool
  → 助手运行权限 ActionContext
  → QuestionOperations（业务能力端口）
  → QuestionOperationService（审核应用层）
  → JobsService / ReviewService / ChangeService
  → BookRepository（原子更新及版本保护）
  → 文件存储适配器
```

`QuestionOperations` 提供 `start / settle / cancel / list / undo`。输入包含不可变的目标、账号、Run 和命令身份；结果明确区分失败、已应用、无修改。后台完成后，通过授权回调重新校验运行权限，再接受候选。取消信号在提交前检查，修改和历史记录仍使用同一个原子事务。

`ActionContext` 只暴露运行有效性检查和教材变更通知；助手不接触 BookRepository。`WorkspaceAccess` 不依赖对话存在，也不受当前聊天资料范围影响。后续接入新的工具或数据源，应实现能力端口和基础设施适配器，不在页面、工具定义或模型 runtime 中增加存储逻辑。

`ConversationView` 只负责消息、输入和运行控制的展示，通过 typed model 与扩展插槽接收状态。宿主分别管理资料选择、教材绑定、修改差异与关闭行为。

## 自动化约束

架构测试继续扫描全部 TypeScript 文件，限制应用层导入基础设施、领域层导入应用层、展示层导入存储实现，并检查模块文件规模。新增约束禁止审核模块依赖助手模块，禁止助手操作适配器依赖教材存储或具体任务服务，禁止知识应用层处理二进制流。

行为回归覆盖：跨任务修改归属、工作区删除后取消、修改记录接口权限、重启续跑、打断后重新定向、撤销冲突和只读权限。浏览器回归覆盖侧栏无多余历史/范围请求、修改记录仅加载一次，以及独立聊天与教材修复闭环。

本次不更改存储格式、导出 JSON 或公开 HTTP 路由。审计是针对当前代码与已覆盖路径的检查，后续能力仍需遵循上述接口和依赖规则，并补充对应行为测试。
