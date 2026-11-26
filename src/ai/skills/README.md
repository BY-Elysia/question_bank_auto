# 课本处理与助手 Skill

当前包含 11 个版本化 Skill 包（8 个课本工作流 Skill：`textbook-structure-detect`、`cross-page-reconcile`、`page-content-extract`、`question-insert`、`source-verify`、`content-repair`、`answer-generate`、`rubric-generate`；3 个助手 Skill：`assistant-chat`、`review-assistant`、`textbook-research`）。每包包含 `SKILL.md`（模型指令）和 `definition.json`（ID、版本、模型角色）。工作流输入输出 schema 由调用的 workflow 显式提供。

SkillRunner 实际读取编译输出中的 Markdown，附加 JSON Schema、任务输入与页图，并调用模型。构建会复制这些资源；每个任务首次调用时锁定版本及指令哈希，恢复时检测变化。调用日志记录模型、用量和哈希，不记录密钥。

课本工作流 Skill 无模型可自行调用的工具。渲染、读取页面、保存与导出均由确定性服务执行（助手对话/研究类 Skill 通过宿主注入受控工具）。结构化输出错误最多重试一次；业务边界和提取冲突有独立的有限重试，详见工作流说明。
