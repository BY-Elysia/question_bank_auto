# 源码架构与修改入口

2026-10-23，版本 0.2.0。本次将协议草案落为模块化 NestJS 骨架，保持业务尚未实现。

## 1. 进程与模块

| 入口 | 模块 | 职责 |
| --- | --- | --- |
| control-api/main.ts | ControlApiModule | 组合身份、工作区、项目、资产、文档、候选修改、任务、题库、模型配置及注册表 |
| control-api/internal-main.ts | InternalApiModule | 组合 JobExecutionModule，提供控制端租约、检查点和产物接口 |
| model-gateway/main.ts | ModelGatewayModule | 组合 GatewayModule，提供模型和工具执行内部接口 |
| workspace-worker/main.ts | WorkspaceWorkerModule | 组装用户容器的执行端口，当前不启动队列或 HTTP 服务 |

内部任务接口属于控制服务，Worker 是这些接口的调用者。模型网关独立入口与公开 API 不共享 Controller 注册。这个阶段通过入口装配隔离路由；真正身份认证和网络隔离在后续实现，当前不能当作生产服务部署。

## 2. 单个模块的分层

```text
modules/documents/
├── documents.module.ts                     # Nest 注册与依赖绑定
├── presentation/
│   ├── documents.controller.ts             # 路径、HTTP 参数和方法
│   └── dto/                                # 对外 DTO 导出
├── application/
│   ├── documents.service.interface.ts      # 用例接口与注入 token
│   ├── commands/                           # 每个操作的参数和结果
│   └── dto/                                # 请求、分页、结果协议类型
├── domain/                                 # 纯 TypeScript 文档/题目类型
├── ports/
│   └── document.repository.ts              # 需要基础设施实现的能力
├── infrastructure/
│   └── documents.unimplemented.service.ts   # 当前明确抛出未实现错误
└── contracts/
    ├── operations/                         # 每个 API 操作一个片段
    └── schemas/                            # 每个命名数据结构一个片段
```

调用方向：Controller → 应用服务接口 → 后续用例实现 → 仓储/外部依赖端口。Nest Module 负责绑定实现。领域、应用契约和端口不依赖 Nest、Controller 或基础设施。

`presentation/dto` 是少量类型导出，实际声明归 application 或 domain 所有，避免应用层反向依赖 HTTP 层。当前 DTO 是 TypeScript 类型声明，尚未安装运行时验证 Pipe；缺失或非法参数不会被假装验证通过并写入数据，而是到达未实现用例后统一返回 501。

`UnimplementedService` 是显式、可替换的占位 provider，不是业务实现。它不保存数据、伪造任务 ID 或返回成功。公共错误过滤器把框架无关的 OperationNotImplemented 转成 Problem 响应。

## 3. AI 目录

```text
ai/skills/question-extract/
├── SKILL.md                                # 模型任务指令与行为边界
├── definition.json                         # ID、版本、模型能力与工具允许列表
├── skill.interface.ts                      # 执行输入、输出、上下文
└── contracts/
    ├── question-extract-input.ts
    ├── question-extract-output.ts
    ├── extracted-questions.ts
    └── schemas/
```

每个 Skill、Tool 和 Workflow 拥有独立目录。definition.json 均为 planned，每个 Skill 的 SKILL.md 定义任务指令草案；本轮没有实现指令加载、模型执行循环或 PDF 流水线。加载和版本约定见 [Skill 包说明](../src/ai/skills/README.md)。

- workflow.interface.ts：业务处理流程边界。
- skill.interface.ts：一次模型工作的输入输出。
- tool.interface.ts：某个可执行能力的参数和结果。
- runtime/*.port.ts：统一执行器接口，包含租约、任务、步骤、版本计划与取消信号上下文。
- providers/model-provider.interface.ts：外部供应商协议边界。

文件转图、裁图与数据库查询仍按确定性服务设计，不因出现在 Tool 目录就自动暴露给所有模型。工具允许列表由 Skill 定义与任务计划控制；这项校验尚未实现。

## 4. 契约的维护和构建

接口源不再是单个大 OpenAPI 文件。`contracts/api.json` 只保存 API 标识，`contracts/common` 保存共享 HTTP 元数据；各模块持有操作和 schema 片段。

schema 片段包含 `name`、`typeFile` 和 `schema`，用来定位对应的源码类型。operation 片段包含 `path`、`method` 和 `operation`。片段中的 `#/components/schemas/...` 在汇总后的 OpenAPI 中解析；片段不是可直接独立发布的完整 OpenAPI 文档。

`scripts/build-contracts.mjs` 收集片段，拒绝重复名称或路径，生成 `dist/contracts/openapi.json`、catalog 和客户端类型，同时生成源码类型与协议类型的双向兼容断言。`npm run typecheck` 会发现结构漂移；JSON Schema 数值范围等运行约束由 JSON Schema 测试验证。

日常修改示例：增加文档字段时，修改对应 `domain/*.ts` 和 `contracts/schemas/*.json`，然后运行 `npm run check`。增加 HTTP 用例时，新增 operation 片段、command/DTO、service interface 方法、Controller 方法和 501 provider 方法，再实现用例。

生成后的完整规格和客户端类型仍然可能很长，这是消费产物。它们只存在于忽略的 dist，不是维护入口，服务端源码也不导入 dist。

## 5. 骨架的验证范围

- TypeScript 编译所有 Module、Controller、领域类型、接口和占位 provider。
- OpenAPI lint 校验汇总契约，AJV 编译全部 schema 并验证正反样例。
- 类型检查对比 184 个源码类型与 OpenAPI 生成类型。
- 实际启动三个 HTTP 应用，对 63 个操作验证 501 Problem 响应，并检查同一操作在另两个入口返回 404。
- Worker 应用上下文可以装配，其执行端口明确抛出未实现错误。
- 架构检查阻止 application/domain/ports 依赖 presentation/infrastructure/Nest，阻止 shared 反向依赖业务模块。
- 源码与契约片段单文件上限 400 行，避免重新集中到巨型文件。

租户权限、文件处理、模型调用、事务一致性、SSE 运行行为仍须在对应实现阶段验证。当前测试不会连接真实数据库、Redis、Docker 或外部模型。
