# 用户工作目录契约

布局版本为 1。宿主机 `/srv/question-bank/users/{userId}` 挂载到对应容器的 `/workspace`。应用代码与已发布的 Workflow/Skill/Tool 由镜像提供，位于 `/opt/app`，工作目录不承担程序发布。

```text
/workspace/
├── workspace.json
├── config/
│   └── ai.json                         # 获授权配置引用的脱敏投影
├── projects/{projectId}/
│   ├── project.json                    # 数据库元信息投影
│   ├── sources/{assetId}/
│   │   ├── original.pdf                # 或图片 / 导入 JSON
│   │   └── metadata.json
│   ├── assets/
│   │   ├── pages/{sourceAssetId}/{renderJobId}/
│   │   │   └── {assetId}.png
│   │   ├── crops/{assetId}.png
│   │   └── attachments/{assetId}.png
│   ├── documents/{documentId}/snapshots/
│   │   └── revision-000001.json
│   ├── jobs/{jobId}/
│   │   ├── execution-plan.json
│   │   ├── steps/{stepId}/attempts/0001/
│   │   │   ├── skill-input.json
│   │   │   ├── model-request.json
│   │   │   ├── model-response.json
│   │   │   ├── tool-calls.jsonl
│   │   │   ├── skill-output.json
│   │   │   └── validation.json
│   │   ├── artifacts/{artifactId}
│   │   └── logs/events.jsonl
│   └── exports/{exportAssetId}/
│       ├── manifest.json
│       ├── question-bank.json
│       └── media/
├── inbox/{uploadId}/
├── cache/
└── tmp/{jobId}/
```

## API 与文件的关联

| API 资源 | 文件/数据库归属 |
| --- | --- |
| Workspace / Project | PostgreSQL 权威记录，本地 JSON 只作投影 |
| Asset | 数据库索引 + 持久化字节；扩展名按校验后的媒体类型选择 |
| Document / Revision | PostgreSQL 权威内容，磁盘 snapshot 为固定版本导出 |
| Job / Step / Checkpoint | PostgreSQL 权威状态，jobs 目录保留诊断和候选产物 |
| Credential | 服务端加密存储，永不写入 workspace |
| ModelProfile / SkillBinding | 数据库版本记录，执行计划只包含引用与版本 |

公开 API 只接受资源 ID。Worker 的 Lease.context 返回经过授权的相对路径，读取时固定以 `/workspace` 为根，严格拒绝 `..`、绝对路径与符号链接逃逸；gateway 按 Asset ID 解析内容，不接受调用方提供任意 URL。

文件名由系统生成。用户上传文件名仅作为元信息，不作为可信目录段。页码存在 Asset.pageNumber 中，不依赖文件名推断顺序。

## 生命周期

- sources 保留原始输入；同内容重复上传是否复用资产由应用策略决定，但每次请求必须遵守幂等键。
- 正式资产只有没有文档、快照和任务引用后才能删除；裁图被题目引用后不能当中间产物清理。
- jobs 产物先写不可变暂存，再以事务登记引用；失败或崩溃留下的孤立产物按保留期回收。
- 原始响应可能含用户资料，受同用户权限保护；保留期限应作为运行配置，不与事件回放的最低期限混淆。
- inbox、cache、tmp 可按策略清理，运行任务目录排除在回收范围外。
- 删除项目不直接递归删除目录；先检查活动任务和引用，软删除后由回收器处理。
- 容器停止、升级、重建均不等于删除工作区。

第一版不开放自定义可执行 Tool 或用户 Skill 上传。以后支持时需新增独立契约，不能通过普通资产上传自动加载代码。
