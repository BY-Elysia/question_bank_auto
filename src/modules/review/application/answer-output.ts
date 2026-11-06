import { z } from 'zod';
import type { OutputContract } from '../../../ai/ports/skills.js';
const Result = z.strictObject({ text: z.string(), explanation: z.string(), issue: z.string() });
export function answerOutput(childIndex: number | null): OutputContract {
  return {
    schema: Result,
    maxOutputTokens: 4096,
    instructions: `本次只解一个目标。不要输出 JSON、代码围栏或反复试错过程。LaTeX 直接使用普通单反斜杠，不作 JSON 转义。只选择以下一个格式，各标记独占一行：
<<<ANSWER>>>
简短最终答案（证明题写结论）
<<<EXPLANATION>>>
必要且完整的推导，公式用 $...$ 或 $$...$$
<<<END>>>
若原图与输入题干不一致、条件不足或无法可靠完成，停止解题，改用：
<<<ISSUE>>>
具体指出不一致/缺失或不能完成的原因；不要臆造答案。
<<<END>>>
输出前核对导数符号位置、正负号、区间和题目目标；不得将相减变相加、凭空添加边界条件。`,
    parseText(raw) {
      if (raw.length > 32000 || /[\t ]{100}|\n{20}/u.test(raw))
        throw new Error('Degenerate answer output');
      const text = raw.trim();
      const markers = text.match(/^<<<[A-Z]+>>>\r?$/gm) ?? [];
      const issue = text.match(/^<<<ISSUE>>>\r?\n([\s\S]+?)\r?\n<<<END>>>$/);
      if (issue && markers.length === 2)
        return { text: '', explanation: '', issue: issue[1]!.trim() };
      const answer = text.match(
        /^<<<ANSWER>>>\r?\n([\s\S]+?)\r?\n<<<EXPLANATION>>>\r?\n([\s\S]+?)\r?\n<<<END>>>$/,
      );
      if (!answer || markers.length !== 3 || !answer[1]!.trim() || !answer[2]!.trim())
        throw new Error('Missing answer sections');
      return { text: answer[1]!.trim(), explanation: answer[2]!.trim(), issue: '' };
    },
    decode(value) {
      const v = Result.parse(value);
      return v.issue
        ? {
            answers: [],
            issues: [
              {
                code: 'ANSWER_INPUT_UNCERTAIN',
                severity: 'warning',
                contentId: null,
                page: null,
                message: v.issue,
              },
            ],
          }
        : { answers: [{ childIndex, text: v.text, explanation: v.explanation }], issues: [] };
    },
  };
}
