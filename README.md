# 新版后端：接口定义

本分支是独立重建的后端起点，当前交付 **仅包含新版接口契约、类型、示例和契约检查**。没有 HTTP 服务、NestJS Controller、数据库实现、容器调度器、Worker、提示词实现或真实模型调用。旧项目文件已从本分支移除，可从原分支和 Git 历史查阅。

## 交付入口

| 文件 | 用途 |
| --- | --- |
| [contracts/openapi.json](contracts/openapi.json) | OpenAPI 3.1.1，公开 API 和内部 API 的唯一结构契约来源 |
| [docs/contract-guide.md](docs/contract-guide.md) | 中文设计说明：身份、工作区、数据版本、任务、模型、Skill/Tool、错误与实现验收 |
| [docs/endpoints.md](docs/endpoints.md) | 完整接口索引，按公开/内部边界列出 |
| [contracts/catalog.json](contracts/catalog.json) | 10 个核心 Skill、6 个 Tool、8 个 Workflow 的版本和 schema 映射；均标记 planned |
| [contracts/examples.json](contracts/examples.json) | 可校验请求、输出和事件样例 |
| [src/contracts/api.d.ts](src/contracts/api.d.ts) | 从 OpenAPI 生成的 TypeScript 类型，不手写修改 |
| [src/contracts/index.ts](src/contracts/index.ts) | 常用类型导出入口 |
| [docs/workspace-layout.md](docs/workspace-layout.md) | 单用户容器的持久化目录与资源 ID 映射 |

规划运行栈：TypeScript、NestJS、PostgreSQL、Prisma、Redis/BullMQ。控制服务和模型网关共享管理能力，每个用户一个工作区 Worker 容器。本轮不安装这些运行依赖，不创建数据库，不启动 Docker。

## 验证与生成

要求 Node.js >= 22.21.0。

```bash
npm ci
npm run check
```

修改 OpenAPI 后：

```bash
npm run generate
npm run check
```

`check` 包含 OpenAPI lint、生成类型一致性、TypeScript 编译检查、JSON Schema 与契约样例测试。`no-unused-components` 关闭是因为 Skill、Tool 和 SSE 的协议 schema 也由注册表引用，不一定直接出现在 HTTP 请求体中；这些引用由契约测试核对。

检查只证明契约的结构、示例和所覆盖的约束一致，**不代表服务器、租户隔离、取消、重试或数据库事务已实现**。

## 约定摘要

- 用户和 Agent 调用 `/api/v1`；工作区容器调用隔离的 `/internal/v1`。
- 用户工作区唯一，身份来自认证令牌；公开请求不能指定其他 ownerId 或文件系统路径。
- PostgreSQL 是文档、题目、版本、任务和资产索引的权威来源；磁盘存放二进制、日志及导出快照。
- 提取、修题、组卷产生候选修改 Proposal；应用时检查文档版本。AI 不直接覆盖现有文档。
- 所有写请求使用 `Idempotency-Key`；修改可变资源使用 `If-Match`。
- 后台任务通过 REST 查询与 SSE 查看进度，断开前端不取消任务。
- Skill、Tool、Workflow、模型配置版本在任务创建时冻结；凭证密钥不进入用户目录或执行计划。
- 3 个后续 Skill（知识点标注、答案复核、组卷规划）只列为待办，当前无可调用契约。

## 后续实现顺序

1. 身份解析、工作区资源、文档与资产仓储。
2. 用户容器生命周期与任务租约、检查点和事件流。
3. 模型网关、凭证、Skill 执行器及允许列表。
4. PDF → 提取 → 候选修改 → 人工应用 → JSON 导出闭环。
5. 题库发布检索、编辑类 Skill 与组卷。

参考：[OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)、[openapi-typescript](https://openapi-ts.dev/introduction)、[Redocly lint](https://redocly.com/docs/cli/commands/lint)。
