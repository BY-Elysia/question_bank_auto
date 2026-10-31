# 课本识别工作流与旧版对应关系

参考基线是提交 d893aef 的 [chapter-extraction-service.ts](https://github.com/BY-Elysia/question_bank_auto/blob/d893aef/backend/src/chapter-extraction-service.ts)，以及 [extraction-instructions.ts](https://github.com/BY-Elysia/question_bank_auto/blob/d893aef/backend/src/domains/question-json/extraction-instructions.ts)。只迁移其识题顺序和边界约束，未复制原有大文件。

| 旧版职责 | 新实现 |
| --- | --- |
| processChapterSessionImage 的 pendingPageDataUrls 和 processingStartQuestionKey | Job.pending、cursor 和 stage 中已完成范围 |
| detectChapterBoundaryAndPendingByDoubao | cross-page-reconcile 的 boundary 模式 |
| detectLastQuestionContinuationWithLookaheadByDoubao | cross-page-reconcile 的 lookahead 模式 |
| shouldAcceptLookaheadContinueQuestionKey | 必须匹配正式队列 tail.key，预读输出不能生成新范围 |
| detectChapterAndQuestionsByDoubao | page-content-extract，边界范围与提取结果一一对应 |
| 空结果、范围遗漏与边界冲突重试 | materialize/guards 校验，最多三次业务提取尝试 |
| 同页章节切换与完整 GROUP 规则 | 结构识别 + 范围 sectionId + Skill 原文约束 |
| 保存待续页和已处理起点 | 校验通过的范围批次私有落盘；整页完成才推进 cursor，整章完成才发布文档 |

## 顺序

1. 通过工作区上传 PDF 或图片。PDF 使用 pdfinfo 检查页数并自动转为全部页图；图片按上传顺序标准化，统一编号。
2. 用户提交旧版提取信息后启动流程，默认前缀缓存。顺序模式全书一个任务；多章模式按用户分组创建隔离任务、并行执行。每章开始处保存基准 revision，内部仍逐页执行。
3. 若上一页已闭合的末题没有 pending，先用 seam 模式独立检查当前页首行归属。明确延续时凭来源坐标重新打开私有范围；不确定则进入审核，不拼接猜测。随后识别当前页章节切换，已有章节引用不可重新定义，新节点来源必须在当前页。
4. 组合“pending 所在页 + 当前页”的正式队列。模型给出完整和未完整内容范围，包括正文、图表和题目。
5. 以下一页作为预读，只判断正式队列尾部是否延续。下一页新题或新章节不能成为本次提取内容。
6. 只提取 complete 范围；包含公共题干的长题只有整体闭合后才输出。选项、小问、原文答案和公式有专门约束。
7. 分别检查范围/结构与转录质量。标题为空、控制字符、零宽字符混入数学字母、LaTeX 括号不闭合时，只对当前范围附带字段反馈重提，最多三次。无法识别的原文明确标为【待校对】，保留来源并进入审核，不靠字符串替换猜公式。
8. 页计划在提取前先固定并保存，恢复时不重新识别其章节和边界，避免同一页坐标漂移。每个通过校验的题目或正文批次保存到私有 stage；同时保存未提取范围。后续范围失败，恢复时复用已验收内容；只有整页成功才推进 cursor。正式文档不显示半成品。队列过长时保留来源并报错。
9. 提交前再次检查转录质量、页首疑似残缺数学片段、脱离上一题的跨页总结和原文答案覆盖。处理完范围后一次性发布 stage。末尾未闭合内容以 INCOMPLETE_RANGE 保留；不确定或不完整内容使任务进入 needs_review。
10. 请求 generateAnswers 时，先确认整本课本已解析且无阻断错误，再检查集中答案块；匹配原文后产生 source 答案候选，确认缺失后才调用 answer-generate。

## 局部重跑与恢复

指定 startPage/endPage 会先扩展到已有跨页内容的全部来源页。若处理过程中发现新的跨页延续，再向后扩展，直至内容闭合或 PDF 结束。完整重跑重建章节，局部重跑沿用已有章节标识；需要修改已存在章节名称或层级时通过人工文档编辑或整本重跑处理。

取消会中断模型请求并保存 cancelled；失败为 failed；进程重新启动后将未结束任务改为 interrupted。resume 要求正式文档 revision 未变化，恢复到最后已保存的 cursor，不重新提交先前已完成内容。Skill 版本/指令哈希变化时拒绝继续旧任务。

## 校对和修复

verify 对选定内容及其原始页图做语义核对，结果记录在任务 issues。repair 返回受 schema 校验的候选内容，保持身份、章节和来源不变。界面可读取 before/after 展示差异；用户接受后才生成正式修订。拆分、合并内容块或调整章节通过带 expectedRevision 的文档替换接口完成。

边界覆盖检查只能保证页面没有被流程跳过，不能证明模型没有漏读页内细节；这也是保留原图定位、verify、修复候选与人工审核的原因。测试使用确定性模型响应验证流程，实际模型质量需要另用真实课本评估。

## 多章编排

用户提供页图分组，不填写章名。每组页码映射成内部 1..N；组内仍执行上述 pending → 正式队列 → 预读 → 完整范围提取，不跨分组预读。组内模型结构识别结果的首个顶层标题作为章名，缺失时提示审核。

全部章节完成后，将局部页码映射回全书页码，并为章节、内容及问题引用添加组命名空间以防冲突。根课本一次性发布，未完成章节只显示预览。随后在合并后的全书范围搜索答案，允许题目和集中答案位于不同章节；AI 生成缺失答案产生待审候选。某章失败不发布半本结果，恢复复用已完成章节和失败章节的检查点。

旧版底层 textbook parse 接口仍支持局部重跑和按需转图，工作区主流程将准备材料与提交提取信息衔接起来，用户无需自行调用转图功能或传文件目录。

## 工作流职责与扩展边界（2026-10-31）

```text
工作区编排（材料准备、章分组、根文档合并）
  → TextbookWorkflow（检查点、事务发布）
    → planPage（章结构、正式队列、预读）
      → page-seam（独立核对已闭合末题与下一页）
    → page-checkpoint（固定已验收页计划，恢复时复用）
    → extractRanges（按题/正文批次提取、业务重试）
      → domain/transcription-quality（纯函数质量规则）
    → context-quality（跨块上下文审核提示）
  → SkillRunner（版本固定、schema 校验、单次总时限、调用记录）
  → ModelClient port → provider adapter（协议、缓存、输出预算、传输重试）
```

业务编排不导入 HTTP、文件系统或供应商实现。新增 AI 能力实现独立 workflow 并注册到任务执行映射，通过 Skills/ModelClient 调用；新增数据库实现 BookRepository 等端口，不将读写逻辑放入提示词或页面处理流程。SKILL.md 保留语义任务要求，确定性范围/来源/质量约束由代码执行。

单次 Skill 默认共享 180 秒总预算，包含缓存种子、网络重试及两次格式尝试；业务重提是新的调用。模型输出默认上限 8192 tokens，可通过 MAX_MODEL_OUTPUT_TOKENS 调整，超长完整题应明确调预算或人工处理，不允许静默截断子问。Responses 的 incomplete、Chat 的非 stop 结束状态均不能通过验收，即使 JSON 恰好有效。参考[方舟 Responses 文档](https://console.volcengine.com/ark/region%3Acn-beijing/docs/create-model-responses-api)。默认仍使用前缀缓存，格式重试改用无缓存严格 schema。

MODEL_TRACE=1 时记录每次调用的输入、反馈、原始输出、时长、格式/结束状态或脱敏错误类别，存入私有诊断目录；不保存密钥和图片 data URL。生产默认关闭原文记录。格式失败、转录质量失败和超时必须分别统计，不能用任务 completed 代替内容正确率。

质量检查是保守规则，不证明数学语义正确或所有原文都被覆盖。历史结果在校验/导出接口也会显示转录问题，但不会阻止用户逐项手工修正未改动的旧内容。旧任务 Skill 哈希变化时需重新提取，不能把新指令悄悄用于旧检查点。
