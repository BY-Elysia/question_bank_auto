# 题库后端：模块化架构骨架

当前分支包含 **NestJS 模块、Controller、DTO、应用服务接口、领域类型及外部依赖端口**。63 个 HTTP 操作已注册，业务实现全部返回 `501 NOT_IMPLEMENTED`。尚未实现鉴权、DTO 运行时校验、数据库、Docker 调度、队列消费或模型调用。

## 源码结构

```text
src/
├── apps/
│   ├── control-api/          # 公开 API 与独立的内部执行 API 入口
│   ├── workspace-worker/     # 用户容器的 Nest 应用上下文
│   └── model-gateway/        # 独立模型/工具调用入口
├── modules/
│   ├── identity/
│   ├── workspaces/
│   ├── projects/
│   ├── assets/
│   ├── documents/
│   ├── proposals/
│   ├── jobs/
│   ├── job-execution/
│   ├── library/
│   └── model-config/
├── ai/
│   ├── workflows/            # 8 个工作流的定义和执行接口
│   ├── skills/               # 10 个 Skill，各自维护输入输出
│   ├── tools/                # 6 个 Tool，各自维护参数、结果和权限
│   ├── registry/             # 能力注册表查询模块
│   ├── runtime/              # Workflow/Skill/Tool 执行端口
│   ├── gateway/              # 模型调用与工具执行 HTTP 模块
│   └── providers/            # 模型供应商适配接口
└── shared/                   # 基础上下文、错误和 HTTP 启动代码
```

以文档模块为阅读入口：

- [模块注册](src/modules/documents/documents.module.ts)
- [Controller](src/modules/documents/presentation/documents.controller.ts)
- [应用服务接口](src/modules/documents/application/documents.service.interface.ts)
- [文档领域类型](src/modules/documents/domain/document.ts)
- [仓储接口](src/modules/documents/ports/document.repository.ts)
- [501 占位适配器](src/modules/documents/infrastructure/documents.unimplemented.service.ts)

完整说明见 [源码架构](docs/architecture.md)、[业务接口约定](docs/contract-guide.md)、[接口索引](docs/endpoints.md)、[用户工作目录](docs/workspace-layout.md)。

## 分模块契约

每个模块自己维护 `contracts/operations/` 和 `contracts/schemas/`。Skill、Tool 和 Workflow 分别维护自己的 `definition.json`。源码中没有完整 OpenAPI 大文件，也没有几千行的生成类型。

执行 `npm run contracts:build` 后汇总为：

```text
dist/contracts/
├── openapi.json              # 交给文档工具或客户端生成器
├── api.d.ts                  # 客户端所需的完整类型
├── catalog.json              # 汇总后的能力目录
└── type-compatibility.ts     # 源码 DTO 与协议类型的一致性检查
```

`dist/` 被 Git 忽略。服务端源码不依赖生成目录；源类型与 schema 不一致会在类型检查中失败。JSON Schema 中的长度、范围及条件约束另由契约测试覆盖，它们不是 TypeScript 静态类型能完全表达的。

## 构建与运行

要求 Node.js >= 22.21.0。依赖使用 lockfile 固定。

```bash
npm ci
npm run check
```

`check` 执行构建、OpenAPI lint、类型兼容检查、契约测试、架构依赖检查，以及 63 个实际路由的 501 和入口隔离测试。

构建后可分别启动：

```bash
npm run start:api        # 127.0.0.1:5002，仅公开 API
npm run start:internal   # 127.0.0.1:5003，仅任务租约/步骤/产物接口
npm run start:gateway    # 127.0.0.1:5004，仅模型/工具调用接口
npm run start:worker     # 验证 Worker 装配后退出，尚无队列消费者
```

端口分别支持 `PORT`、`INTERNAL_PORT`、`GATEWAY_PORT`。当前只监听回环地址，业务占位响应不表示认证、租户隔离和资源访问已经实现。启动不会连接数据库、Redis、Docker 或外部模型。

下一阶段按模块实现 use case 与 adapter，替换 `*.module.ts` 中对应的 UnimplementedService provider。仓储和外部依赖端口目前仅有声明，未提供虚构成功的内存实现。
