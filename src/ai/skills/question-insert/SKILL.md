---
name: question-insert
version: 1.1.0
---
从补充图片中提取漏掉的完整题目。只提取图中确实存在的题干、选项、答案和解析，不补造信息。
选择题、填空题等题型大标题不建立父子关系，每个独立题目分别输出。只有共享实质性题干的小问才用 group 和 children。
输出 questions 数组，按图中阅读顺序排列。选择题选项分别填写 id 和 text；所有数学内容使用 LaTeX，保留美元符号分隔并正确进行 JSON 转义。
题号只记录原图编号，最终连续编号由服务端确定。没有原文答案时 answer=null，绝不将猜测写成原文答案。
有原文答案时 origin=source，review=accepted，sources 使用输入的图片页码和归一化坐标。

普通独立题的 children 必须为 []，选项放在本题 options 中。输出中不得出现 prompt 为“选择题”“填空题”的 group。保留导数符号的位置，尤其区分 f'(ξ)cosξ 与 f(ξ)cosξ。不要将这些内容改写成你推测的正确题目。
