# 析页 · 课本 PDF / 图片结构化工作台

将一整本课本 PDF 或按顺序上传的图片转为可追溯的 JSON：章节、正文、公式、表格、图片、例题、习题和原文答案。提供原图与内容坐标、校对、修复候选、缺失答案生成、版本恢复和 JSON/ZIP 导出。当前版本 0.3.0，30 个业务/健康接口均有实现。

每个实例独占一个数据目录，可管理多个逻辑工作区；每个逻辑工作区对应一本教材。用户只选择工作区、上传材料、填写信息和审核结果，不需要提供路径。已接入 React 前端，不包含用户管理、题库、组卷或通用 Agent 平台；每个用户独立容器的调度仍需后续接入。

## 运行

要求 Node.js >= 22.21.0，以及 Poppler 的 `pdfinfo`、`pdftoppm`。macOS 可通过 `brew install poppler` 安装，Debian/Ubuntu 使用 `apt-get install poppler-utils`。模型需要支持视觉输入和 JSON 输出。

```bash
npm ci
npm --prefix client ci
cp .env.example .env
# 编辑 .env，配置模型服务地址、密钥和模型名称
npm run build:all
node --env-file=.env dist/app/apps/control-api/main.js
```

也可先向进程环境导出配置，再运行 `npm run start:api`。启动不会自动加载 `.env`；上面的 Node 命令会显式加载。

```bash
# 或使用 Docker Compose；端口默认只发布到宿主机回环地址
# 按 .env.example 配置 .env 后执行
docker compose up --build
```

前端地址 `http://127.0.0.1:5002`，后端 API 前缀 `/api`。开发前端运行 `npm run dev:web`（5173，代理后端 5002）。[前端设计、架构与验证](docs/frontend-2026-10-26.md)。

默认工作目录 `./workspace`。未接入鉴权，当前作为本地/受控工作区服务使用，不要通过修改监听地址将其直接公开。

## 最短使用路径

```bash
curl -X POST 'http://127.0.0.1:5002/api/workspaces/pdf?title=Mathematics' \
  -H 'Content-Type: application/pdf' --data-binary @textbook.pdf

# 或按上传顺序传入图片，不需要转换页面
curl -X POST 'http://127.0.0.1:5002/api/workspaces/images?title=Mathematics' \
  -F 'images=@page1.png' -F 'images=@page2.jpg'

# ID 为上述任一种上传返回的 id；轮询至 actions.configure=true 后填写旧版信息
curl 'http://127.0.0.1:5002/api/workspaces/ID'
curl -X POST 'http://127.0.0.1:5002/api/workspaces/ID/extract' \
  -H 'Content-Type: application/json' \
  -d '{"metadata":{"version":"v1.1","courseId":"","textbookId":"","title":"Mathematics","publisher":"","subject":"数学","hasAnswer":false,"answerHandlingMode":"generate_brief"}}'

# 同一接口提供进度、页图 URL、章节、正文、问题和审核候选
curl 'http://127.0.0.1:5002/api/workspaces/ID'
```

PDF 上传返回 `preparing`，后台自动渲染全部页图；图片上传完成即为 `ready`。转换完成后才允许提交提取信息。提取默认使用前缀缓存；多章模式仅提交每组页码，章名由模型识别。前端根据 `nextStep`、`actions` 和资源 URL 实现逐步操作，无需切换目录。接口示例见 [API 文档](docs/api.md)。

需要人工处理的结果标为 `needs_review`；AI 答案和修复先作为候选，接受后进入正式 JSON。导出仅包含已接受的正式内容，同时保留校验结果和待审核数量。

## 架构与工作流

- [工作区流程与本轮验证](docs/workspace-flow-2026-10-25.md)
- [前端重建与运行指南](docs/frontend-2026-10-26.md)
- [架构与目录](docs/architecture.md)
- [可用性、测试与架构检查报告](docs/backend-audit-2026-10-25.md)
- [与旧版对应的识题工作流](docs/extraction-workflow.md)
- [接口使用与审核流程](docs/api.md)
- [模型 Skill 指令](src/ai/skills/README.md)

领域对象和 HTTP 请求通过 Zod 做运行时校验；同一套 schema 生成 `dist/contracts/openapi.json`。大规格只作为构建产物存在。SKILL.md 会复制进构建目录，由执行器实际读取、锁定版本和哈希。

## 验证与当前边界

```bash
npm run check
```

检查包括 TypeScript、OpenAPI、模块依赖、真实 PDF/PNG/HTTP/ZIP 链路，以及跨页、漏题重试、恢复、取消、答案来源、候选冲突等回归测试。默认测试中的模型返回使用可控响应；本地 HTTP 模拟服务验证 Responses/Chat Completions 协议、重试和取消。另有真实 SQLite 仓储替换测试，以及新增 Skill/任务处理器的扩展测试。

真实模型端测需要已配置的密钥，会产生模型调用费用，默认不会随 `npm test` 运行：

```bash
# 先 npm run build；环境变量已导出时也可用 npm run test:live
node --env-file=.env scripts/live-e2e.mjs
# 新工作区流程：PDF 自动转图、多章并行、自动章名、默认缓存和补答案
node --env-file=.env scripts/live-workspaces.mjs
```

它通过 HTTP 上传原创两页 PDF，检查跨页大题、原文答案、AI 补答案、候选审批、原文核对、OCR 修复、版本恢复、PNG 和 JSON/ZIP 导出。默认最多 40 次模型执行器调用、20 分钟工作时间，可用 LIVE_MAX_CALLS / LIVE_TIMEOUT_MS 调整。结果、用量和文件存放于打印出的临时目录，不记录密钥。小样本端测不代表整本复杂教材的 OCR 或解题准确率。

持久化使用原子文件替换和进程内互斥；一个数据卷只允许一个后端进程使用。没有引入 PostgreSQL、Redis 或分布式队列。进程重启后运行中的任务标记 `interrupted`，通过 resume 接口从检查点恢复。长题超过待处理页预算会失败并保留检查点，不丢弃旧页。

默认前缀缓存适配方舟 Responses 接口。其他供应商或 Chat Completions 可显式指定 `cache: "off"`；不支持时返回明确错误，不静默关闭缓存。缓存调用在供应商侧设置 `store: true`，有效期一小时；本地只保存缓存种子 ID 和到期时间，缓存键包含工作区、模型和受控指令哈希。
