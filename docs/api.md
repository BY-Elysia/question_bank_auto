# HTTP 使用约定

前缀 `/api`。上传使用 `application/pdf` 二进制请求体；其他写操作使用 JSON。运行时校验拒绝未知字段。没有用户/权限接口。完整机器契约由 `npm run build` 生成至 `dist/contracts/openapi.json`。

| 方法与路径 | 用途 |
| --- | --- |
| GET /health | 运行状态与模型是否配置 |
| POST /textbooks?title=... | 上传课本 PDF，返回课本 ID 与页清单 |
| GET /textbooks | 课本摘要列表 |
| GET /textbooks/:id | 课本、任务、检查点、候选完整状态 |
| DELETE /textbooks/:id | 删除课本及文件；有活动任务时拒绝 |
| GET /textbooks/:id/source | 下载原始 PDF |
| GET /textbooks/:id/pages/:page/image | 按需渲染并返回 PNG |
| GET /textbooks/:id/document | revision 与结构化 document |
| PUT /textbooks/:id/document | 人工替换文档，包括章节调整、内容拆分/合并 |
| PATCH /textbooks/:id/contents/:contentId | 修改一个完整内容块 |
| POST /textbooks/:id/jobs | 创建解析、核对、修复或答案任务 |
| GET /textbooks/:id/jobs | 任务列表，不包含大 stage |
| GET /textbooks/:id/jobs/:jobId | 进度、事件、错误、问题和 stage |
| POST /textbooks/:id/jobs/:jobId/cancel | 取消任务 |
| POST /textbooks/:id/jobs/:jobId/resume | 恢复失败、取消或中断任务 |
| GET /textbooks/:id/proposals | 查看模型修复/答案候选及前后差异 |
| POST /textbooks/:id/proposals/:proposalId/decision | 接受或拒绝候选 |
| POST /textbooks/:id/validate | 结构、覆盖和已记录的语义问题 |
| GET /textbooks/:id/revisions | 修订号列表 |
| POST /textbooks/:id/restore | 恢复旧版为新修订 |
| GET /textbooks/:id/export.json | 导出正式 JSON，保留来源、审核状态和问题 |
| GET /textbooks/:id/export.zip | JSON、source.pdf 及所有页图 |

## 任务请求

```json
{"kind":"parse","generateAnswers":true}
```

```json
{"kind":"parse","startPage":12,"endPage":15}
```

```json
{"kind":"verify","contentIds":["c_r_12_3"]}
```

```json
{"kind":"repair","contentIds":["c_r_12_3"],"instruction":"对照原图修复第二个小问的公式，不改变其他内容"}
```

```json
{"kind":"answers","sectionId":"sec_12_1"}
```

answers 可按 contentIds、sectionId（含后代章节）或 startPage/endPage 筛选。只处理空答案，不覆盖已存在答案。整本尚未解析时拒绝开始；存在解析阻断问题时返回 needs_review 并说明。repair 必须指定内容和修复要求。

任务状态：queued、running、completed、needs_review、failed、cancelled、interrupted。cursor 是下一待处理 PDF 页；stage 是未正式发布的阶段内容；processedIds 是校对/修复/答案任务已处理的内容 ID。默认通过 GET 轮询，不实现 SSE。

## 人工变更与候选审核

PATCH 内容请求为 `{"expectedRevision":1,"content":{完整 Content}}`；PUT 文档请求为 `{"expectedRevision":1,"document":{完整 Document}}`。读取 GET document 获得当前版本和字段。人工改写答案会标为 human/accepted。

候选决定：

```json
{"expectedRevision":1,"decision":"accept"}
```

拒绝使用 decision=reject。接受后返回新 revision，下次写入应携带它。过期 revision 或候选 before 不匹配会返回 409。拒绝候选不改变内容修订号。

恢复：`{"expectedRevision":3,"revision":1}`。返回新修订 4，而不是将版本倒退至 1。

## 可视化数据

section.source 与 content.sources 都使用 PDF 页码及 0–1 坐标；页清单保存渲染后的 width/height，尚未渲染时为 null。将坐标乘以实际显示宽高即可框选原文。返回数据保留题目层级、选项、答案来源、问题和候选差异，供后续前端实现对照校对。

图片类内容的 sources 就是原图区域引用。ZIP 包中的 `pages/<page>.png` 与 JSON 的 pages.image 一致；调用方可按 box 裁切，不依赖外部图片 URL。未接受的模型候选不进入正式导出内容。
