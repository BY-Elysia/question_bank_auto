# 真实教材输出追踪与优化（2026-10-28）

## 先纠正上一轮判断

对 16–19.jpg 的旧结果重新检查全部字段后发现：第 14 题的完整证明仍在 `content.text`，被摘要化的是 `question.answer.explanation`，前端展示后者。因此不能把它描述成“整个 JSON 丢失了证明”。问题是两份字段内容不一致、结构化答案没有完整转录，导致界面看起来缺失。本次把题目正文归入 question、content.text 留空，并要求每个子问保留其原书解答。

## 原始输出与实际发现

所有新实测启用 `MODEL_TRACE=1`。每次 Skill 调用记录 system/schema、任务输入、重试反馈、来源页号、未经修补的 rawOutput、校验错误、请求的输出格式、耗时和 usage。输出、教材图片和密钥不提交仓库。

1. **格式错误不只是长批次问题**：单题同样出现未转义反斜杠、错括号，以及把 table/caption 放在 content 外的合法 JSON。普通 JSON 模式实测仍会失败，严格模式也有失败样本，不能假设服务端一定遵循格式。
2. **组合题语义错误**：输出 `type=group` 却给 `children=[]`。原先整页结束才检查，导致别的题跟着重跑；现在逐题校验和反馈，页检查点仍在整页成功后原子提交。
3. **跨页重复题**：模型将第 2 题前三小问放 complete，剩余小问另起 key 放 pending，后续生成两条同题。新增重叠校验，禁止完整/待续题目相互包含同一来源区域，也禁止换 key 重复覆盖已处理题目；skill 要求同题紧随的证明与全部小问统一一个范围。
4. **起始残片未报告**：模型把半截证明称为完整正文。boundary 新增 orphanedStarts，经过范围校验后由 workflow 生成 MISSING_QUESTION_START，保留可见片段、不猜题干。
5. **没有正式章首页**：允许清晰页眉的章号和章名作为初始化章节的来源；已有章节时不重复建节点。
6. **核对偏差**：一版加强的核对 prompt 会把原书未写的推导误报为遗漏。最终使用“独立转录→比较引用”的两步核对；引用必须在独立转录及候选内容中真实存在，不支持的引用只产生人工核对警告。
7. **证明题答案状态**：有完整 explanation、没有独立结论 text 的原文证明，也应视为已有答案，不能触发补答案。
8. **缺续页未告警**：最终样本第 5 题只有第一小问的原书证明，第二小问 answer=null，模型未报告问题。增加独立于模型的 PARTIAL_SOURCE_ANSWERS 提示，检查“已有部分原书解答、其他小问无答案”的组合题；保留空答案，不推断原书一定缺答案。新提取流程、校验接口和 JSON 导出均使用此规则。

## Workflow 与 provider 的调整

- 每道 question/example/answer 单独提取，其他文本最多四个范围一批。跨页题不拆页，仍发送其全部来源页。失败不会部分发布当前页。
- 首次请求默认 prefix + json_object；仅结构校验失败后的第二次请求使用 cache=off + strict json_schema。原始 Zod 和业务校验仍保留，服务端 schema 仅使用兼容的形状约束。
- 此策略有服务商依据：[Responses 结构化输出](https://docs.volcengine.com/docs/ark/responses-api-structured-output?lang=zh)、[上下文缓存限制](https://docs.volcengine.com/docs/ark/context-cache?lang=zh)。显式缓存支持 json_object，不支持 json_schema，因此不在严格重试中带 previous_response_id。
- Skill 版本和 hash 都会记录；测试创建固定 skill 快照，避免构建替换 dist 文件影响在途调用。本次确实出现一次该测试环境干扰，保留原失败报告，未将其算成模型错误。

## 核对对照实验

- 原始第 14 题（含完整 content.text）：独立转录比较后无遗漏；这支持上面的纠正。
- 在隔离副本删除该 text、保留结构化摘要：检出两个确实缺失的中间等式，另有一项引用未通过定位而标为 warning。原始测试工作区未修改。
- 新提取的第 14 题：两个小问的结构化答案均保存中间推导，经独立转录比较后无遗漏报告。
- 核对结果不是数学正确率或全书 OCR 准确率的证明。图到文字的独立转录仍可能出错，不能称为无损保证。

## 自动化检查

- 后端 62 项测试通过，包括输出记录、私有文件权限、格式重试、逐题语义校验、跨页重复保护、核对引用、页覆盖及部分答案告警验证。
- 前端 5 项 Playwright 端测通过；这些测试使用模拟模型，不代表真实模型准确率。
- 构建、TypeScript、OpenAPI 校验、变更文件格式检查通过。
- 边界重叠保护是基于同页坐标的启发式校验，不是语义去重的充分条件；模型给出不准确或不相交的范围时仍可能漏检。子问解答归属和转录保真仍需要真实样本及人工校对。

## 最终四页真实回归

使用 16、17、18、19.jpg，分为两个章节并行处理。首次 31 次调用后，第二章因结构化输出失败而停止；保留原始失败报告，随后从检查点恢复一次，用 6 次调用完成。合计 37 次调用，记录 7 次结构校验失败、0 次 provider 请求失败，累计 cachedTokens=54347。这些数字只统计最终四页测试及其恢复，不包含前面的探索与对照实验。

恢复后共 19 个内容块、11 道顶层题，19 项检查通过：

- 第 14 题跨第 1–2 张图片，两小问均有 source 解答，负自变量的中间推导保存在结构化字段。
- 第二章第 2 题跨第 3–4 张图片，仅出现一次，五个小问均有对应解答。
- 第 3 题七个小问及答案保留；题目 text 为空，没有双份题目字段。
- 两个章名识别、合并 ID、页码隔离、四张预览图、JSON 与 ZIP 导出通过。
- 起始缺题干残片保留并告警。第 5 题缺第二小问解答，新增确定性规则通过校验接口及导出验证。该规则在本次模型完成后加入，原始历史 document.issues 未追写；后续提取会在提交前生成提示。

最终状态为 needs_review，不能据此宣称首次全自动通过或全书转录无损。严格 schema 请求仍有失败原文；本次验证的是失败拦截、恢复和上述具体内容检查。

实测使用固定 skill 快照。章节识别指令在本次测试后仅将版本号从 1.1.0 升到 1.2.0，指令正文相同；其余快照版本与本次提交一致。

本地完整最终样本、原始调用及索引归档在 `workspace/diagnostics/2026-10-28/final/`；探索失败与独立转录对照记录归档在同级目录。该目录已被 Git 忽略；仓库只保存这份脱敏报告和可复用测试脚本。

## 运行与查看

常规服务默认 `MODEL_TRACE=0`；需要诊断时设为 1。原始记录在 `WORKSPACE_ROOT/books/<bookId>/runs/<jobId>/<invocationId>.json`，权限 0600，不包含 API 密钥、HTTP 授权头或图片 base64。日志包含用户材料，保留在用户工作区，不进入普通 API 响应。

- `node scripts/summarize-model-runs.mjs /absolute/test/root`：生成本地 trace-index.json，按时间列出调用、版本、校验结果和反馈标记。
- `LIVE_IMAGE_DIR=/absolute/pic1-5 LIVE_QUALITY_CHECKS=1 node scripts/live-textbook-images.mjs`：四页真实样本及质量断言。
- `LIVE_WORKSPACE_ROOT=/absolute/test/root node scripts/live-image-resume.mjs`：用固定 skill 快照从检查点恢复。
- `LIVE_WORKSPACE_ROOT=/absolute/test/root node scripts/live-transcription-audit.mjs`：在隔离副本对第 14 题核对。
- 旧样本故障注入增加 `LIVE_AUDIT_DROP_RAW_TEXT=1`；仅修改临时副本，测试遗漏检测。

以上真实调用需要通过环境配置 MODEL_* 凭据；测试脚本不内置密钥，不在默认 CI 中消耗模型。
