# question_bank_auto

这是一个把教材 PDF 页图转成题库 JSON 的本地工具。它的核心不是“单纯 OCR”，而是把图片按页送给豆包模型，结合当前章/小节上下文、跨页状态和题号范围约束，逐步把题目写入标准化 JSON 文件。

项目由两部分组成：

- `frontend/`：Vue 3 + Vite 单页界面，负责上传 PDF、初始化章节会话、触发逐页处理和目录自动处理。
- `backend/`：TypeScript + Express 服务，负责 PDF 转图、调用豆包模型、管理章节/题目会话、维护 JSON 文件。

当前这版工作台除了主流程，还补上了题库维护能力：

- `结构化处理`：基础教材 JSON、章节会话初始化、单页处理、目录流式自动处理。
- `页图工作台`：上传 PDF、批量切页、勾选页图、回看输出目录。
- `题目修复`：按章节/小节/题号定点覆盖单题，输出到 `repair_json/`。
- `图片补充`：给题目补挂图片资源，自动回写 `media`。
- `LaTeX 修复`：对已有题库 JSON 做公式和块级 LaTeX 清洗，输出到 `latex_repair_json/`。
- `题库可视化`：按章节树浏览题目与答案，并直接渲染公式。
- `JSON 合并`：把多个章节 JSON 去重拼接，输出到 `merged_json/`。
- `豆包读取`：直接上传图片做逐字转写，不进入结构化抽题流程。

运行过程中会用到这些目录：

- `uploads/`：上传的原始 PDF。
- `uploads/question_media/`：补挂到题目上的图片资源。
- `output_images/`：PDF 转出的页图，按文件夹保存。
- `repair_json/`：单题修复、公式修复、图片补充后生成的新 JSON。
- `merged_json/`：多文件去重合并后的结果。
- `latex_repair_json/`：LaTeX 批量修复后的结果。
- `read_results/`：模型原始转写文本、自动处理失败日志、待校对日志。
- 外部 `output_json/`：用户自己指定的 JSON 保存目录，后端只写入，不负责创建。

## Git 说明

- 当前默认分支是 `main`。
- 如果你切换了远程仓库，先用 `git remote -v` 确认 `origin` 指向正确地址，再执行提交和推送。
- 建议把本地密钥放到终端环境变量里，不要把真实密钥直接写进准备推送的源码。

## 目标 JSON 结构

系统围绕一个教材 JSON 文件持续增量写入，顶层结构固定为：

```json
{
  "version": "v1.1",
  "courseId": "c_001",
  "textbook": {
    "textbookId": "tb_001",
    "title": "教材名",
    "publisher": "出版社",
    "subject": "学科"
  },
  "chapters": [],
  "questions": []
}
```

其中：

- `chapters` 是章节树。
- `questions` 是题库数组，后端按 `questionId` 做增量更新，不是每次全量重写逻辑。

## 运行入口

### 1. 启动后端

```bash
cd backend
npm install
npm run dev
```

默认监听 `http://127.0.0.1:5000`。

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认前端地址是 `http://127.0.0.1:5173`。

前端会通过代理访问后端的：

- `/api`
- `/uploads`
- `/output_images`
- `/read_results`

### 3. 生产模式

```bash
cd frontend
npm install
npm run build

cd ../backend
npm install
npm run build
npm start
```

后端会静态托管 `frontend/dist`。

## 环境变量

后端支持这些关键环境变量：

- `PORT`：服务端口，默认 `5000`
- `PDF_RENDER_DPI`：PDF 转图 DPI，默认 `180`
- `PDF_JPEG_QUALITY`：JPG 质量，默认 `90`
- `ARK_API_KEY`：豆包方舟 API Key，必填
- `ARK_BASE_URL`：默认 `https://ark.cn-beijing.volces.com/api/v3`
- `ARK_MODEL`：默认 `doubao-seed-2-0-pro-260215`
- `ARK_TIMEOUT_MS`：模型请求超时，默认 `300000`
- `ARK_RETRY_TIMES`：失败重试次数，默认 `3`
- `ARK_RETRY_DELAY_MS`：重试间隔，默认 `1200`
- `MAX_PENDING_QUEUE_PAGES`：跨页待补队列最大页数，默认 `6`

当前后端直接读取进程环境变量；如果没设置 `ARK_API_KEY`，调用模型时会报 `ARK_API_KEY is missing`。

### 设置 ARK_API_KEY

PowerShell 当前终端会话：

```powershell
$env:ARK_API_KEY="你的方舟APIKey"
cd backend
npm run dev
```

PowerShell 持久写入用户环境变量：

```powershell
setx ARK_API_KEY "你的方舟APIKey"
```

执行 `setx` 后需要重新打开一个新的终端窗口再启动项目。

macOS / Linux Bash：

```bash
export ARK_API_KEY="你的方舟APIKey"
cd backend
npm run dev
```

## 页面操作流程

前端界面现在是多工作台结构，其中“结构化处理”仍然是主链路，其余工作台负责修复、浏览和合并已有题库。

工作台入口包括：

- `结构化处理`：基础 JSON 生成、章节会话初始化、手动逐页处理、自动流式跑目录。
- `页图工作台`：PDF 转图、页图选择、预览和投喂模型前准备。
- `题目修复`：定点补题或覆盖已有题目。
- `图片补充`：给指定题目挂载图片资源。
- `LaTeX 修复`：修理已有 JSON 里的公式格式问题。
- `题库可视化`：按章节树筛选查看题目、答案和小题结构。
- `JSON 合并`：把拆分的多个 JSON 文件合并成一个结果文件。
- `豆包读取`：只做图片转写，不做结构化提取。

### 1. 基础 JSON 生成

用户先填写：

- `version`
- `courseId`
- `textbookId`
- `title`
- `publisher`
- `subject`

前端会生成一个 `chapters=[]`、`questions=[]` 的基础 JSON；如果点击保存，会调用 `POST /api/textbook-json/save`，直接把这个空壳写到指定目录。

这一步只负责创建教材文件，不做识别。

### 2. PDF 转图

用户上传 PDF 和目标文件夹名后，前端调用 `POST /api/convert`。

后端会做这些事：

1. 校验文件必须是 PDF。
2. 生成批次号，把原始 PDF 存到 `uploads/`。
3. 在 `output_images/<folderName>/` 下清空旧内容。
4. 用 `pdf-poppler` 把每一页转成 JPG。
5. 把转出的图片重新命名为 `1.jpg`、`2.jpg`、`3.jpg`。
6. 返回页数和每张图片的 URL，供前端后续勾选或自动处理。

这一步仍然不写题库，只是准备图片输入。

### 3. 章节会话 + 题库自动处理

这是项目的核心链路。

用户先提供：

- 目标 JSON 文件路径
- 当前章标题
- 当前小节标题

前端调用 `POST /api/chapters/session/init` 后，后端会：

1. 读取目标 JSON。
2. 确保当前顶层章存在；不存在就创建。
3. 确保当前章下的小节存在；不存在就创建。
4. 创建 `chapterSessions` 和 `questionSessions` 两套内存会话。

这两套会话分别负责：

- `chapterSessions`：记录当前章、当前小节、JSON 路径。
- `questionSessions`：记录跨页待补队列、起始题号、续题标记、上次待处理原因。

初始化完成后，可以走两种处理方式：

- 单张手动上传：`POST /api/chapters/session/process-image`
- 按目录自动流式处理：`POST /api/chapters/session/auto-run-stream`

## 题库 JSON 自动处理的真实逻辑

下面是每处理一页时，后端真正执行的顺序。

### 第一步：加载会话状态

处理函数是 `processChapterSessionImage`。

它会先读取：

- 当前页图片
- 当前 `sessionId`
- 可选的下一页预读图 `lookaheadImageDataUrl`
- 当前 JSON 文件
- 当前章/小节上下文
- 题目跨页待补队列

如果之前已经有跨页未完题，系统不会只看当前页，而是把“待补页 + 当前页”拼成一个输入队列。

因此存在两种模式：

- `single_page`：当前没有跨页遗留，只看这一页。
- `cross_page_merge`：把历史待补页和当前页合并后再判断。

### 第二步：先做边界检测，不急着抽题

系统不会一上来就让模型输出完整题目 JSON，而是先调用 `detectChapterBoundaryAndPendingByDoubao` 做边界判断。

这一步只让模型回答 4 个问题：

- `hasExtractableQuestions`：从当前处理起点开始，这一批图里是否已经有完整题可以入库。
- `needNextPage`：当前处理起点题是否还需要下一页。
- `continueQuestionKey`：当前输入队列里“最后出现的那道顶层大题”是谁，如果它还没结束则返回它。
- `reason`：模型对判断的说明。

这里最关键的设计是：

- 起点题和最后一题不是一个概念。
- `needNextPage` 是围绕“当前起点题”判断。
- `continueQuestionKey` 是围绕“整批图最后出现的大题”判断。

这样做是为了避免小节切换或同页多题时，错误地把“当前页最后一题”和“待续题”混为一谈。

### 第三步：可选做下一页预读，修正续题判断

如果自动处理模式下已经知道下一页图，后端会额外调用 `detectLastQuestionContinuationWithLookaheadByDoubao`。

这一步只做一件事：

- 判断“当前队列最后一题”是否真的延续到了下一页预读图。

它不会抽题，也不会判断当前起点题是否完整，只是修正 `continueQuestionKey`，让跨页判断更稳。

### 第四步：只有确认有完整题，才进入结构化提取

如果边界检测返回 `hasExtractableQuestions=true`，后端才会调用 `detectChapterAndQuestionsByDoubao`。

这一步会同时让模型输出两块结构：

- `chapter`：本轮最后一页是否切换到了新章/新小节
- `question`：当前允许范围内可入库的题目数组

这里的提取不是“这一页看到什么提什么”，而是严格受两个边界参数控制：

- `startQuestionKey`
- `endBeforeQuestionKey`

含义是：

- 从哪一题开始提。
- 提到哪一题之前为止，截止题本身不能输出。

如果 `endBeforeQuestionKey=null`，系统要求模型必须把起点之后所有完整大题都提出来，不能只提第一题。

### 第五步：模型输出不是直接入库，要先过清洗和修复

模型返回的内容先走这些步骤：

1. 从回复中抽出第一个 JSON 对象。
2. 尝试普通 `JSON.parse`。
3. 如果失败，做转义修复、尾逗号修复、控制字符修复。
4. 如果还失败，触发一次“重新看图生成 JSON”。
5. 还不行，再触发一次“只修复 JSON 结构”的兜底请求。

所以系统对模型 JSON 格式错误有三层兜底：

- 本地修补
- 重新生成
- 专门修 JSON

### 第六步：题目归一化

模型产出的题目对象在入库前会统一归一化。

后端会补齐或重写这些字段：

- `chapterId`
- `questionId`
- `nodeType`
- `questionType`
- `title`
- `prompt`
- `standardAnswer`
- `rubric`
- `media`

核心规则包括：

- 题目统一分为 `LEAF` 和 `GROUP`。
- `GROUP` 题必须有 `stem` 和 `children`。
- 题号会转成统一格式，例如 `q_9_3_1`、`q_9_3_1_2`。
- 章节编号统一转成 `ch_...` 格式。
- 题目标题会被重写成“`习题8.1 第3题`”或“`习题8.1 第3题 第2小题`”。
- `standardAnswer` 会清理掉“思路总结、归纳、拓展”这类不该进入标准答案的文本。
- `rubric` 会被补齐并强制校正到总分 `10`。
- 图片 `media.url` 会按 `questionId` 自动生成 URL 占位。

### 第七步：做三类质量校验

即使模型已经返回了结构化题目，系统也不会直接相信。

后端会继续做三层检查。

#### 1. 范围错提检查

通过 `detectExtractorRangeMismatch` 检查模型有没有犯这类错误：

- 边界判断明明说起点后还有完整题，但提取结果只返回了起点题。
- 明明设置了截止题，却没有按范围提。

如果发现范围不对，会带着更强的提示词重提一次；再不行，就整批不入库，保留队列等下一页。

#### 2. 待校对重提

如果提取结果里出现 `【待校对】`，系统会记录待校对位置，并尝试让模型只修这些位置。

如果修完后 `【待校对】` 数量减少或不增加，就采用修复结果；否则保留原结果。

待校对日志会写入：

- `read_results/pending_review_questions.jsonl`

#### 3. 完整性检查

通过 `detectQuestionIntegrityIssue` 检查题目是否看起来没提完整，典型信号有：

- `GROUP` 小题序号明显断档。
- 某些小问有题干但没有答案。
- 答案末尾像被截断，例如只停在“所以”“因此”“=”“（”这种未闭合状态。

如果发现问题，系统会先尝试重提一次；如果还不完整，就把问题题及其后面的题从本轮结果里截掉，把这道题标记为待续题，进入下一页继续拼接。

### 第八步：处理章节/小节切换

结构化提取除了返回题目，还会返回：

- `chapterTitle`
- `sectionTitle`
- `switchSectionTitle`

规则是：

- 默认继承当前章/小节。
- 章或小节切换只看输入队列的最后一页。
- 如果最后一页中途切到新小节，切换前题目仍归旧小节，切换后题目改归新小节。

后端会根据这些信息：

1. 保证新章存在。
2. 保证新小节存在。
3. 更新当前会话的章/小节。
4. 用最终落定的 `chapterId` 重写题目标题。

### 第九步：按 `questionId` 增量写入 JSON

真正写入时，后端不是简单 `push`，而是调用 `upsertQuestionsById`：

- 如果 `questionId` 不存在，就新增。
- 如果 `questionId` 已存在，就替换旧题。

这意味着同一道题在跨页补全后，后续结果会覆盖之前的半成品，而不是重复插入。

### 第十步：更新跨页队列状态

本轮处理结束后，系统会根据结果更新 `questionSessions`。

存在三种结果：

#### 情况 A：当前还没有完整题可入库

- 当前页会加入 `pendingPageDataUrls`
- `processingStartQuestionKey` 保持不变
- 等下一页继续拼队列

#### 情况 B：已经有题入库，但最后一题还没结束

- 已完成的题先入库
- 当前页作为新的待补起点页
- `pendingContinueQuestionKey` 设为最后那道未完题

#### 情况 C：本轮所有题都完整结束

- 清空待补队列
- 清空待续题
- 下次新页重新从头判断

## 自动处理目录模式

前端点击“自动逐页处理目录”后，会调用 `POST /api/chapters/session/auto-run-stream`。

后端会：

1. 扫描目录中的图片文件。
2. 按自然顺序排序。
3. 一页一页调用 `processChapterSessionImage`。
4. 对每一页附带下一页预读图。
5. 用 NDJSON 流把进度实时推给前端。

流里的事件有四种：

- `start`
- `progress`
- `result`
- `done`

前端会把这些事件转成日志文本，显示每页处理结果、当前小节、是否跨页、重试原因和题目入库数量。

如果某页失败，后端会把错误写入：

- `read_results/auto_process_failures.jsonl`

## 其它接口

除了题库自动处理主线，后端还提供若干辅助接口。

### `POST /api/doubao/read`

输入已有图片 URL 数组，例如：

```json
{
  "imageUrls": ["/output_images/数学分析/1.jpg"]
}
```

后端会把这些图片转成 Data URL，调用豆包做逐字转写，并把结果保存为 `read_results/*.txt`。

这个接口只做可见文本转写，不做结构化题库提取。

### `POST /api/doubao/read-files`

前端可以直接上传图片文件给豆包做逐字转写，不经过 PDF 转图目录。

### `POST /api/textbook-json/repair-question`

按章节、小节和题号定点修复单题，支持多张连续页图片，结果输出到 `repair_json/`。

### `POST /api/textbook-json/repair-math-format`

只修已有题目里的公式文本，不重跑整题识别，结果输出到 `repair_json/`。

### `POST /api/textbook-json/attach-images`

给指定题目挂图片并回写 `media`，结果输出到 `repair_json/`。

### `POST /api/textbook-json/repair-latex`

对整份题库 JSON 做确定性 LaTeX 清洗，结果输出到 `latex_repair_json/`。

### `POST /api/textbook-json/merge`

把多个章节 JSON 去重合并，自动整理章节树和题目顺序，结果输出到 `merged_json/`。

## 设计上的几个关键点

这个项目能稳定处理教材题库，关键不在单次提示词，而在后端对模型结果做了强约束。

### 1. 先判边界，再抽结构

把“是否已有完整题”“最后一题是谁”“是否要续页”先单独问一轮，比直接一把抽全量题目更稳。

### 2. 章节切换和跨页题分开判断

最后一页可能同时发生：

- 老题没结束
- 新小节开始
- 新题出现

后端通过独立的边界检测和预读确认，把这些状态拆开处理，避免题号和小节串位。

### 3. 所有入库都受范围控制

提取器不是自由发挥，它必须遵守 `startQuestionKey` 和 `endBeforeQuestionKey`。这对跨页题非常重要。

### 4. 模型输出只是候选，不是结果

范围检查、待校对重提、完整性检查，都是为了阻止“看起来像对、其实是错”的题直接入库。

### 5. JSON 文件是持续演化的

每次只改当前识别到的章节和题目，因此适合按页、按章节、按目录慢慢积累，不要求一次处理完整本书。

## 当前局限

目前系统有这些边界条件需要注意：

- 章节会话和题目会话保存在内存里，服务重启后会丢失，需要重新初始化会话。
- 依赖图片质量；如果 PDF 转图模糊，后续结构化提取会明显变差。
- 前端中的部分默认路径是本机开发时写死的示例值，换机器后需要手工改成自己的路径。
- `MAX_PENDING_QUEUE_PAGES` 默认只保留最多 6 页的跨页队列，特别长的跨页题需要根据实际情况调大。

## 代码定位

如果要继续改这套逻辑，主要看这里：

- `backend/src/server.ts`
  - `processChapterSessionImage`：整条自动处理主流程
  - `detectChapterBoundaryAndPendingByDoubao`：跨页边界检测
  - `detectChapterAndQuestionsByDoubao`：章节 + 题目联合提取
  - `normalizeQuestionItem`：题目归一化
  - `detectQuestionIntegrityIssue`：完整性检查
  - `upsertQuestionsById`：按 `questionId` 增量写回
- `frontend/src/App.vue`
  - 页面操作入口
  - 自动处理进度展示
  - JSON 初始化和保存逻辑
