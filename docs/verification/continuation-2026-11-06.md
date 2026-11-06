# 历史跨页续句修复与干净工作区（2026-11-06）

用户报告的教材来自 2026-10-31 提取，使用 cross-page-reconcile 1.3.0。原始 lookahead 输出（调用 38c0cb58-698b-47a0-abd1-e0fca7d41ccf）误判第三题在第一页结束、下一页开头为第四题。下一页 boundary（f79efdba-6d74-4e48-90b0-e735b070da0c）又把“综上所述”标为 paragraph，其 reason 明确称“顶部段落为上题结论”。这是边界归属错误，不是预览漏渲染；旧结果不会随代码升级重新提取。

当前 workflow 已有 seam 反向复核。本次进一步要求预读逐行检查下一新题号前的总结，不把页眉章名当成正文新章节；同时禁止已进入 pending 的题目证据区域被另一个 paragraph/formula/answer 范围重复占有。Skill 版本升至 1.5.1。86 项后端测试通过，包括续句被拆分拒绝、相邻独立区域允许、闭合题重新打开及不确定归属保留问题记录。

对用户指定的历史教材，只将已识别的总结句原文追加到第三题第（2）问解析，并补充该问及整题第二页来源，移除独立重复块。先在副本验证，再停止服务，通过 BookStore 提交 revision 2；原 revision 1 保留。其他内容逐项比较未变，未重新生成答案。公网确认第三题第二小问显示总结句、两页跳转正常，6 内容块、2 题，无浏览器异常。此次没有运行新的真实模型提取；原模型输出已直接核查。

源码/镜像 dc8cd12 已发布。修复数据的原始备份在服务器 shared/continuation-repair-20261106/original-state.json，测试结果与截图在本地忽略提交的 workspace/diagnostics/continuation-2026-11-06/。

随后按用户要求换新管理员账号并启用全新独立数据卷 textbook-workspace-clean-20261106，原 textbook-workspace 数据卷完整保留（含刚修复的历史教材）。这是单管理员实例切换，不是新增多用户权限系统。旧账号失效，新教材库不包含历史测试；凭据只放部署环境和私有诊断目录，不提交版本库。原 compose/access 环境文件备份保留在 shared 下带 before-clean-account-20261106 的文件中。

新账号公网登录验证通过：工作区列表为空，刷新仍保持登录，退出正常，无浏览器异常。结果保存在本地 workspace/diagnostics/clean-account-2026-11-06/。
