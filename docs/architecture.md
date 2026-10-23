# 后端架构

## 范围

单工作区课本处理服务。保留 PDF 上传、章节和内容解析、可视化数据、人工编辑、模型修复、缺失答案补全和导出。旧版身份、题库、试卷、模型配置管理、通用工具注册表与独立网关入口已移除。模型适配器仍独立于工作流。

```text
src/
├── apps/control-api/             # Nest 装配、HTTP 启动、异常映射
├── modules/
│   ├── textbooks/
│   │   ├── domain/               # 内容、章节、来源、课本与一致性检查
│   │   ├── ports/                # 工作区仓储、PDF、页图端口
│   │   ├── application/          # 上传、资产、导出用例
│   │   ├── infrastructure/       # 原子文件仓储、Poppler、按需页图缓存
│   │   └── presentation/         # HTTP 路由、请求契约
│   ├── jobs/                     # 任务状态、后台执行、取消和恢复
│   └── review/                   # 原文核对、修复/答案候选、接受拒绝与版本
├── ai/
│   ├── workflows/textbook-extraction/  # 页队列、预读、提取、检查点
│   ├── skills/                   # 六个实际加载的 SKILL.md 包
│   ├── runtime/                  # schema 校验、有限重试、指令锁定、调用日志
│   └── providers/                # Responses / Chat Completions 适配器
└── shared/                       # 框架无关业务错误、请求校验
```

Controller 负责解析输入和调用用例。用例依赖仓储/PDF/图像端口；Nest 装配根绑定文件系统与模型适配器。领域模型不依赖 Nest，应用用例不导入 infrastructure。没有 501 占位实现。

## 数据与修订

Content 是统一内容块，kind 区分 heading、paragraph、formula、figure、table、example、question、answer。每块有稳定 ID、章节 ID 及来源 `[{page,box}]`。box 是 `[left,top,right,bottom]`，坐标在 0–1 范围内。图片通过来源页图与区域保留，导出不生成虚构的图片地址。

Question 保留题号、题型、题干、选项、答案及共享题干下的子问；沿用旧版一层 GROUP/子问语义。更深的印刷嵌套应保留在相应小问题干中。原文答案有页码坐标；AI 生成与人工答案明确标记来源。题目缺答案以 null 表示。

Document 修订与任务检查点分开：每页结果先写任务 stage，整个选定范围处理完后原子替换正式文档并增加 revision。运行期间可查看 stage 进行进度可视化；任务失败不破坏已发布修订。完整解析使用新 stage，局部重跑保留范围外内容。

人工编辑、候选接受、历史恢复要求 expectedRevision。接受候选还会逐项比较当前内容与候选 before，阻止过期内容被覆盖；多个互不冲突的候选可依次接受。恢复创建新修订，不倒退修订号。

## 工作目录

```text
workspace/books/<book-id>/
├── source.pdf
├── pages/<pdf-page>.png             # 按需缓存，不依赖原文件名
├── state.json                      # 正式文档、任务、检查点、候选
├── revisions/<revision>.json        # 不可变文档快照
└── runs/<job-id>/
    ├── <skill-id>.json              # 任务固定的版本/指令哈希
    └── <invocation-id>.json         # 模型、用量、时间、指令哈希
```

仓储以临时文件写入、fsync 和 rename 提交，按课本串行更新；模型调用不持有仓储锁。页图有单页并发去重。每本课本同时允许一个任务；整个卷由单进程独占，不能开启多个副本共写同一卷。

## 模型与部署

支持 MODEL_PROTOCOL=responses 或 chat；兼容旧版 ARK_* 环境变量作为回退。MODEL_NAME 为默认模型，VISION_MODEL / REASONING_MODEL 可分别覆盖。模型 HTTP 超时默认 180 秒；429、5xx、网络错误和超时最多尝试 3 次，取消信号中断请求及退避等待。

SKILL.md 是受控系统任务指令，页图与用户输入作为独立数据发送。服务端强制 schema 和范围校验；模型没有自主文件、网络、数据库工具。构建复制 Skill 包，任务恢复时检测版本或指令哈希变化。

Dockerfile 打包 Node 和 Poppler。一个容器加一个卷构成工作区，本轮没有用户注册、容器调度或多租户网关。尚未实现跨进程分布式锁和高可用队列。
