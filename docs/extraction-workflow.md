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
| 保存待续页和已处理起点 | 每页成功后原子保存 stage、pending、cursor |

## 顺序

1. 通过工作区上传 PDF 或图片。PDF 使用 pdfinfo 检查页数并自动转为全部页图；图片按上传顺序标准化，统一编号。
2. 用户提交旧版提取信息后启动流程，默认前缀缓存。顺序模式全书一个任务；多章模式按用户分组创建隔离任务、并行执行。每章开始处保存基准 revision，内部仍逐页执行。
3. 识别当前页章节切换。已有章节引用不可重新定义，新节点来源必须在当前页。
4. 组合“pending 所在页 + 当前页”的正式队列。模型给出完整和未完整内容范围，包括正文、图表和题目。
5. 以下一页作为预读，只判断正式队列尾部是否延续。下一页新题或新章节不能成为本次提取内容。
6. 只提取 complete 范围；包含公共题干的长题只有整体闭合后才输出。选项、小问、原文答案和公式有专门约束。
7. 检查范围个数、key、来源页、题目结构、答案来源。冲突时附带反馈重试；达到上限后停止，cursor 不越过失败页。
8. 原子保存本页 stage 和 pending 后前进。队列过长时保留所有未完成来源并报错，不采用旧版截断队列的做法。
9. 处理完范围后，将 stage 提交为正式修订。末尾未闭合内容以 INCOMPLETE_RANGE 保留，任务状态 needs_review。
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
