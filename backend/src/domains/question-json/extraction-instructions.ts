import { resolveAnswerHandlingMode } from './payload'
import type { AnswerHandlingMode } from '../../types'

function numberInstructionLines(startNo: number, lines: string[]) {
  return lines.map((line, index) => `${startNo + index}) ${line}`)
}

function buildSharedQuestionContentRuleLines(
  startNo: number,
  resultFieldName = 'questionsToUpsert',
  answerHandlingMode: boolean | AnswerHandlingMode = 'extract_visible',
) {
  const mode = resolveAnswerHandlingMode(answerHandlingMode)
  const lines = [
    'GROUP 类型如有公共题干，必须写入 stem.text；不能漏掉，也不能把公共题干塞进 children.prompt，不能把小题的题目写入stem.text。',
    'GROUP.children 的 prompt.text 不要保留“(1)”“（2）”这类前缀编号；编号只用于 orderNo/子题顺序。',
    '只有同一顶层题号下出现 (1)/(2)/①/② 等子问并共享同一题干时，才允许使用 GROUP。',
    '“一、填空题”“二、选择题”“三、判断题”“四、计算题/证明题/解答题”等只作为栏目标题或题型说明，不作为题目节点，不要把栏目标题提取成 GROUP。',
    '栏目标题下面的“1.、2.、3.”等每一个编号题都必须作为独立顶层大题提取；即使它们同属填空题、选择题等栏目，也不能合并到同一个 GROUP 里。',
    '如果某个编号题自身又包含 (1)/(2)/①/② 等小问，并且共享该编号题的公共题干，才把这个编号题做成 GROUP；GROUP 的 children 只能来自该编号题内部的小问。',
    'questionId 的主编号按当前小节所有顶层题出现顺序连续递增，不因“填空题/选择题/计算题”等栏目切换而重置。',
    'title 可以保留栏目名和栏目内显示题号用于区分；例如整节第9道顶层题是“计算题”栏目里的第2题，则 questionId 可为 q_12_8_9，但 title 应写成“总习题十二 计算题 第2题”。',
    'GROUP/长题只有在整道顶层大题已经闭合时才允许输出；如果后续小问仍未出现、仍在续页、或只完整看到了前几个小问，整道题都不得输出。',
    '长题必须完整覆盖所有可见小问；禁止只输出前几个和最后一个，中间大量缺失。',
    mode === 'generate_brief'
      ? '如果某道长题的小问序号明显断档，就不要把这道题误判成已经完整收齐的小问结构。'
      : '如果某道长题的小问序号明显断档、或最后一个答案只写了一半，就不要把这道题当成完整题输出。',
    `如果本次可见范围里有完整题号与题干，${resultFieldName} 不得为空。`,
    'title 中的栏目内题号按图片显示；questionId 中的主编号按当前小节顶层题全局顺序连续编号。',
    'questionId 必须以 q_ 开头，格式示例: q_9_3_1, q_9_3_1_2。',
    'chapterId 必须以 ch_ 开头，questionId 与 chapterId 前缀不可混用。',
    '若题型是 SINGLE_CHOICE 或 MULTI_CHOICE，prompt.text 只保留题干本身；A/B/C/D 选项必须拆到 options 数组中，不能继续拼在 prompt.text 末尾。',
    '当同一页跨到新小节时，切换后的题必须使用新小节的 chapterId 和对应 questionId 前缀，不能继续沿用旧小节。',
    '不确定字符用【待校对】替代，禁止猜测。',
  ]

  if (mode === 'generate_brief') {
    lines.push(
      'prompt.text 必须逐字贴近图片原文，不得总结改写，不得补充题干。',
      '本次文档无现成答案，standardAnswer.text 需要根据题目自行生成，不要伪装成图片原文。',
      '生成答案必须包含必要解题步骤：计算题要写出关键计算过程，证明题要写出关键论证链条，不能只给结论或省略关键推导。',
      '若题型是 SINGLE_CHOICE 或 MULTI_CHOICE，prompt.text 只写题干，不得把 A/B/C/D 选项行混入 prompt.text；选项必须逐项写入 options。',
      '若题型是 SINGLE_CHOICE 或 MULTI_CHOICE，standardAnswer.text 只写正确选项字母，如 "B" 或 "A,C"；解析过程必须写入 standardAnswer.explanation，禁止写成“答案：B\\n解析：...”或把解析混入 standardAnswer.text。',
      '答案应是完整可校对的标准答案；不要写题外拓展、方法总结、多个解法对比或长篇讲义。',
      '若题目要求编程、写代码、设计算法实现或输出程序，standardAnswer.text="" 且 standardAnswer.media=[].',
    )
  } else if (mode === 'leave_empty') {
    lines.push(
      'prompt.text 必须逐字贴近图片原文，不得总结改写，不得补充推导。',
      '本次文档无可提取答案，不得自行作答；所有 standardAnswer 字段保持空字符串与空 media。',
      '即使题目看起来可以根据常识求解，也不能补写图片中不存在的答案。',
    )
  } else {
    lines.push(
      'prompt.text 与 standardAnswer.text 必须逐字贴近图片原文，不得总结改写，不得补充推导。',
      '不得根据常识、公式套路或上下文自行补充图片中不可见的答案；课本没显示出来的内容不能自己续写。',
      'standardAnswer 必须保留与答案相关的课本上有的推导/证明过程，不能编撰不存在的过程，删除思路探索、归纳总结、方法拓展等无关内容。',
    )
  }

  return numberInstructionLines(startNo, lines)
}

function buildSharedQuestionStructureInstructionLines(
  answerHandlingMode: boolean | AnswerHandlingMode = 'extract_visible',
) {
  const mode = resolveAnswerHandlingMode(answerHandlingMode)
  const lines = [
    '题目对象必须是 LEAF 或 GROUP 两种之一。',
    'questionType 只能取: PROOF, CALCULATION, CODE, SHORT_ANSWER, SINGLE_CHOICE, MULTI_CHOICE, JUDGE。',
    'questionType 映射规则: 填空题=>SHORT_ANSWER；选择题/单项选择题=>SINGLE_CHOICE；多项选择题=>MULTI_CHOICE；判断题=>JUDGE；含“编程/程序/代码”=>CODE；含“证明”=>PROOF；含“求/解/计算”=>CALCULATION；无法判断=>SHORT_ANSWER。',
    'LEAF 必填字段:',
    '- questionId, chapterId, nodeType("LEAF"), questionType, title, prompt, standardAnswer, defaultScore, rubric',
    'GROUP 必填字段:',
    '- questionId, chapterId, nodeType("GROUP"), questionType, title, stem, children',
    'GROUP.children 每项必填字段:',
    '- questionId, orderNo(从1递增), questionType, chapterId(与父题一致), prompt, standardAnswer, defaultScore, rubric',
    'prompt / stem / 普通题 standardAnswer 的 TextBlock 结构固定为: { "text": "string", "media": [] }',
    '选择题字段规则:',
    '- SINGLE_CHOICE / MULTI_CHOICE 还必须包含 options、correctOptionIds、allowPartial。',
    '- options 结构固定为: [{ "id": "A", "text": "string" }, { "id": "B", "text": "string" }, ...]；选项文字不得再写回 prompt.text。',
    '- SINGLE_CHOICE 的 correctOptionIds 必须且只能有 1 个选项 id，allowPartial 固定为 false。',
    '- MULTI_CHOICE 的 correctOptionIds 必须写全部正确选项 id；未明确允许部分得分时 allowPartial=false。',
    '- 选择题 standardAnswer.text 只写正确选项字母；若需要解析，写入 standardAnswer.explanation，示例: { "text": "B", "media": [], "explanation": "..." }。',
    'TextBlock.text 必须使用 Markdown 文本，保持原顺序和原换行。',
    '公式写法: 行内公式使用 $...$；独立成行公式使用 $$...$$。',
    '公式必须转成 LaTeX，使用Katex语法，不得改成口语描述。',
    'LaTeX 写入 JSON 字符串时，所有反斜杠都必须双写，例如 \\frac 在 JSON 中必须写成 \\\\frac，\\sqrt 必须写成 \\\\sqrt，\\times 必须写成 \\\\times。',
    '严禁输出会被 JSON 当成转义字符吞掉的单反斜杠写法，例如 \\frac、\\times、\\rho、\\nu、\\left、\\right、\\begin{aligned}、\\end{aligned}；这些在 JSON 里都必须写成双反斜杠形式。',
    '凡是使用块公式 $$...$$ 的地方，必须成对闭合；若出现 \\begin{aligned}、\\end{aligned}、\\begin{cases}、\\end{cases} 等环境，必须放在完整闭合的 $$...$$ 或 $...$ 内，禁止只写开头不写结尾。',
    'media 如有图片，结构固定为: { "type":"image", "url":"https://9_3_1.png", "caption":"string", "orderNo":1 }',
    'media.url 统一按 questionId 去掉前缀 q_ 后生成，例如 questionId=q_9_3_1 则 url=https://9_3_1.png。',
    '无图时 media 必须是空数组 []，不得省略字段。',
    'rubric 为数组，元素结构: { "rubricItemKey":"key_1", "maxScore": number, "criteria":"string" }',
    'rubric 条数必须为 2-4 条；rubricItemKey 必须连续 key_1,key_2,...；criteria 不得为空字符串。',
    'rubric 每条 maxScore 必须为正数，所有 maxScore 总和必须等于 10。',
    '每题 defaultScore 固定 10，且 rubric 所有 maxScore 之和必须等于 10。',
  ]
  lines.push(
    mode === 'generate_brief'
      ? '本次文档无现成答案，standardAnswer 必须基于题目自行生成包含必要解题步骤的标准答案，并继续遵守 Markdown/LaTeX/TextBlock 结构；不能只给结论或省略关键推导。若题目是编程/写代码题，则 standardAnswer.text="" 且 standardAnswer.media=[].'
      : mode === 'leave_empty'
        ? '本次文档不提供答案，所有 standardAnswer 字段必须保留，但统一返回 standardAnswer.text="" 且 standardAnswer.media=[].'
        : '若图片中未给出标准答案: standardAnswer.text="" 且 standardAnswer.media=[].',
  )
  return lines
}

export {
  buildSharedQuestionContentRuleLines,
  buildSharedQuestionStructureInstructionLines,
}
