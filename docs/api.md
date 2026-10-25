# HTTP 使用约定

前缀 `/api`。PDF 上传使用 `application/pdf` 二进制请求体，图片上传使用 multipart/form-data；其他带参数的写操作使用 JSON。运行时校验拒绝未知字段。没有用户/权限接口。完整机器契约由 `npm run build` 生成至 `dist/contracts/openapi.json`。

## 工作区入口（前端主流程）

| 方法与路径 | 用途 |
| --- | --- |
| GET /workspaces | 工作区摘要列表 |
| POST /workspaces/pdf?title=... | 上传 PDF，202 返回 preparing，后台自动转换全部图片 |
| POST /workspaces/images?title=... | multipart 字段 images，201 返回 ready |
| GET /workspaces/:id | 工作区统一可视化数据、进度、下一步及允许操作 |
| POST /workspaces/:id/extract | 图片准备完成后提交提取信息，202 异步执行 |
| POST /workspaces/:id/cancel | 取消转图/提取并保存检查点 |
| POST /workspaces/:id/resume | 恢复失败、取消或中断的流程 |
| DELETE /workspaces/:id | 删除工作区及源文件、页图、章节子任务；活动流程需先取消 |

上传图片按 multipart 顺序编号为 1..N；支持静态 PNG、JPEG、WebP。后端校验内容并处理方向、尺寸，存为标准 PNG，不使用文件名构造路径。单张最多 20 MB、一次最多 500 张、总量最多 100 MB；像素最多 4000 万，最长边缩放至 1800。原始上传图片字节不另存；PDF 会保留源文件。PDF 请求默认最大 100 MB，可配置 MAX_UPLOAD_SIZE。

`GET /workspaces/:id` 返回：

- `workspace`：状态、准备页数、总页数、设置和错误。
- `pages[].imageUrl`：可直接加载的页图地址；`sourceUrl` 仅 PDF 非空。
- `document`、`revision`、`proposals`：正式内容、版本和候选。
- `jobs`：根教材的核对、修复、补答案等任务及 issues，省略内部 stage。
- `chapters`：章节识别名称、分组页码、处理进度与 `preview`。预览来源坐标已转换为全书页码，与根页图直接对应；未完成预览不能当正式导出。
- `nextStep`：preparing / configure_extraction / extracting / retry / review / deleting。
- `actions`：configure、cancel、resume、review、export、delete 的可用性。
- `exportJsonUrl`、`exportZipUrl`：导出地址。

PDF 自动转图完成后进入 configure_extraction；图片上传直接进入这一步。图片未准备完，extract 返回 409，不提前调用模型。前端只需保存工作区 ID，重新打开时 GET 即可恢复对应画面，不提交服务端路径。准备期间展示 preparedPages/totalPages，不必提前请求未准备好的图片。

提取表单与旧版一致，无新增年级必填字段：

```json
{
  "metadata": {
    "version": "v1.1",
    "courseId": "course-001",
    "textbookId": "book-001",
    "title": "数学教材",
    "publisher": "出版社",
    "subject": "数学",
    "hasAnswer": false,
    "answerHandlingMode": "generate_brief"
  },
  "instructions": "保留例题及解题步骤",
  "mode": "chapters",
  "chapters": [{"pages": [1, 2, 3]}, {"pages": [4, 5, 6]}]
}
```

metadata.title / subject 必填；version 默认 v1.1，courseId / textbookId / publisher 默认空字符串，hasAnswer 默认 true。hasAnswer=true 时只允许 extract_visible；hasAnswer=false 可选 generate_brief（保留旧枚举名，生成带步骤答案）或 leave_empty，也可 extract_visible。未提供策略时按 hasAnswer 推导。instructions 可省略。

默认 `mode=sequential`、`cache=prefix`、`concurrency=2`。顺序模式处理全部页图，无需 chapters。多章模式至少两组，每页必须且只能归属一组，组内页码升序，可非连续；重复、遗漏、越界和未知字段均拒绝。用户不传章名，后端识别后写入 chapters[].title；无法识别时保留 null 并提示人工检查。并发数范围 1–4。

所有章节解析完再合并全书、查找原文答案并按选项补答案。失败章节从检查点恢复，已完成章节不重跑。运行中禁止直接修改正式文档或启动竞争任务；恢复时检测 revision，避免覆盖用户已修改的内容。

## 内容、审核与底层任务接口

工作区 ID 同时是根课本 ID；下列接口用于审核、修复和导出。旧 PDF 上传入口保留兼容，采用按需转图；新前端上传统一走 workspaces。工作区拥有的课本不出现在旧课本列表。

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
| GET /textbooks/:id/export.zip | JSON、所有页图及可用时的 source.pdf |

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

任务状态：queued、running、completed、needs_review、failed、cancelled、interrupted。cursor 是任务内下一待处理页；stage 是未正式发布的阶段内容；processedIds 是校对/修复/答案任务已处理的内容 ID。默认通过 GET 轮询，不实现 SSE。

## 人工变更与候选审核

PATCH 内容请求为 `{"expectedRevision":1,"content":{完整 Content}}`；PUT 文档请求为 `{"expectedRevision":1,"document":{完整 Document}}`。读取 GET document 获得当前版本和字段。人工改写答案会标为 human/accepted。

候选决定：

```json
{"expectedRevision":1,"decision":"accept"}
```

拒绝使用 decision=reject。接受后返回新 revision，下次写入应携带它。过期 revision 或候选 before 不匹配会返回 409。拒绝候选不改变内容修订号。

恢复：`{"expectedRevision":3,"revision":1}`。返回新修订 4，而不是将版本倒退至 1。

## 可视化数据

section.source 与 content.sources 都使用页码及 0–1 坐标；页清单保存渲染后的 width/height，尚未渲染时为 null。将坐标乘以实际显示宽高即可框选原文。返回数据保留题目层级、选项、答案来源、问题和候选差异，供后续前端实现对照校对。

图片类内容的 sources 就是原图区域引用。ZIP 包中的 `pages/<page>.png` 与 JSON 的 pages.image 一致；调用方可按 box 裁切，不依赖外部图片 URL。未接受的模型候选不进入正式导出内容。

导出 JSON 增加 `metadata`，保存旧版教材信息；未经过工作区表单的旧课本为 null。新接口的实际 schema 以生成的 OpenAPI 为准。
