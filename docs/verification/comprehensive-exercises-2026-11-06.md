# 综合练习拆题与 v1.1 导出（2026-11-06）

依据用户提供的高等数学练习册第二章 PDF 第 8 页及参考 1.json：纸面“1.填空选择题”下的 8 项均独立成题，原书第 2 题接续为第 9 题。原书中真正共享题干的多问题保留 GROUP，不对所有子问做机械展开。

结构识别、边界判定与内容提取的 SKILL.md 同步增加栏目规则。边界校验拒绝将纯题型栏目作为 question；内容校验拒绝纯题型栏目作为 group。领域层按综合练习节内阅读顺序编号，原印刷标签保存为 sourceLabel；不改动普通习题的题号。正式提交、章节投影和题库导出复用同一编号逻辑。

默认 `/api/textbooks/{id}/export.json` 与资料包 textbook.json 改为 v1.1 题库结构：version/courseId/documentType/textbook/chapters/questions。独立题 LEAF，真实公共题干组 GROUP；选择题 options、correctOptionIds、allowPartial，填空题映射 SHORT_ANSWER 并保留题干空位。无答案时 standardAnswer=null、correctOptionIds=[]，不能根据选项猜答案。按参考文件默认 defaultScore=10；当前未生成评分细则，rubric=[]，不伪造细则。内部正文/坐标/校对数据仍保留，完整数据接口为 content.json。

后端 88 项测试通过；覆盖连续编号、原号保留、普通习题不变、类型栏目拒绝、真实组保留、选择选项与答案映射、默认 HTTP 导出契约。选项公式浏览器测试使用用户样例的两道选择题，验证 8 个选项、分式/极限/根式在内容块和完整题目预览中均由 KaTeX 渲染，无错误节点；相关 4 项浏览器测试通过。

隔离真实模型验证使用第 8 页渲染图，模型识别 10 个 question 范围（8 个栏目题及原书第 2、3 题）；抽取第 1、4、8 项，分别为 single_choice/fill_blank/single_choice，选项数 4/0/4，children 均为空、原书无答案所以 answer 均为空。原始输出及记录保存在服务器 shared/exercise-live-20261106，测试容器未挂载用户数据卷，也没有在用户教材库创建测试数据。本次不是全 11 页重新提取，不能由此断言所有题均已验证。

完整浏览器流程其余 6 项通过；首项因旧按钮名称及匹配过宽而失败，更新定位后单独重跑通过，覆盖 PDF 上传、自动转图、提取、编辑、修复候选、核对、JSON/ZIP 下载和历史恢复。

发布版本 fc43be0 已推送并部署，生产镜像健康。发布前用户工作区数量为 0 且无活动任务；仍挂载原干净数据卷，未切换账号或数据。公网验证登录、刷新持久化及空教材库通过，无浏览器异常。回滚配置 shared/compose-before-fc43be0.yaml；公网验证结果在本地 workspace/diagnostics/exercise-export-2026-11-06/production.json。
