# 课本 PDF 结构化后端

将一整本课本 PDF 转为可追溯的 JSON：章节、正文、公式、表格、图片、例题、习题和原文答案。提供原图与内容坐标、校对、修复候选、缺失答案生成、版本恢复和 JSON/ZIP 导出。当前版本 0.3.0，22 个业务/健康接口均有实现。

本轮只运行一个工作区，不包含前端、用户管理、题库、组卷或通用 Agent 平台。每个实例独占一个工作目录；可将实例作为一个 Docker 工作区部署。

## 运行

要求 Node.js >= 22.21.0，以及 Poppler 的 `pdfinfo`、`pdftoppm`。macOS 可通过 `brew install poppler` 安装，Debian/Ubuntu 使用 `apt-get install poppler-utils`。模型需要支持视觉输入和 JSON 输出。

```bash
npm ci
cp .env.example .env
# 编辑 .env，配置模型服务地址、密钥和模型名称
npm run build
node --env-file=.env dist/app/apps/control-api/main.js
```

也可先向进程环境导出配置，再运行 `npm run start:api`。启动不会自动加载 `.env`；上面的 Node 命令会显式加载。

```bash
# 或使用 Docker Compose；端口默认只发布到宿主机回环地址
# 按 .env.example 配置 .env 后执行
docker compose up --build
```

默认地址 `http://127.0.0.1:5002`，工作目录 `./workspace`。未接入鉴权，当前作为本地/受控工作区服务使用，不要通过修改监听地址将其直接公开。

## 最短使用路径

```bash
curl -X POST 'http://127.0.0.1:5002/api/textbooks?title=Mathematics' \
  -H 'Content-Type: application/pdf' --data-binary @textbook.pdf

# 将 BOOK_ID 替换为上传返回的 id；解析含集中答案页后才会补全缺失答案
curl -X POST 'http://127.0.0.1:5002/api/textbooks/BOOK_ID/jobs' \
  -H 'Content-Type: application/json' \
  -d '{"kind":"parse","generateAnswers":true}'

curl 'http://127.0.0.1:5002/api/textbooks/BOOK_ID/jobs'
curl 'http://127.0.0.1:5002/api/textbooks/BOOK_ID/proposals'
curl 'http://127.0.0.1:5002/api/textbooks/BOOK_ID/export.zip' -o textbook.zip
```

上传只检查 PDF 并建立页清单；图像按需渲染并缓存，不需要等待整本书渲染后才拿到课本 ID。任务异步运行，GET 任务接口提供状态、当前页、范围、事件、错误和检查点。需要人工处理的结果标为 `needs_review`，不会冒充完全解析成功。导出仅包含已接受的正式内容，同时保留校验结果和待审核数量。

## 架构与工作流

- [架构与目录](docs/architecture.md)
- [与旧版对应的识题工作流](docs/extraction-workflow.md)
- [接口使用与审核流程](docs/api.md)
- [模型 Skill 指令](src/ai/skills/README.md)

领域对象和 HTTP 请求通过 Zod 做运行时校验；同一套 schema 生成 `dist/contracts/openapi.json`。大规格只作为构建产物存在。SKILL.md 会复制进构建目录，由执行器实际读取、锁定版本和哈希。

## 验证与当前边界

```bash
npm run check
```

检查包括 TypeScript、OpenAPI、模块依赖、真实 PDF/PNG/HTTP/ZIP 链路，以及跨页、漏题重试、恢复、取消、答案来源、候选冲突等回归测试。测试中的模型返回使用可控响应；另有本地 HTTP 模拟服务验证 Responses/Chat Completions 协议、重试和取消。它们验证业务与协议，不代表真实模型的 OCR 准确率或学科解题质量。

持久化使用原子文件替换和进程内互斥；一个数据卷只允许一个后端进程使用。没有引入 PostgreSQL、Redis 或分布式队列。进程重启后运行中的任务标记 `interrupted`，通过 resume 接口从检查点恢复。长题超过待处理页预算会失败并保留检查点，不丢弃旧页。
