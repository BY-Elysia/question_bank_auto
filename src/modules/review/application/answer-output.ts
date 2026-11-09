import { z } from 'zod';
import { Scoring } from '../../textbooks/domain/grading.js';
import { rubricOutput } from './rubric-output.js';
import type { OutputContract } from '../../../ai/ports/skills.js';
const Result = z.strictObject({
  text: z.string(),
  explanation: z.string(),
  issue: z.string(),
  scoring: Scoring.optional(),
});
export function answerOutput(
  childIndex: number | null,
  scoring?: { required: boolean; defaultScore: number },
): OutputContract {
  return {
    schema: Result,
    maxOutputTokens: 4096,
    instructions:
      `本次只解一个目标。不要输出 JSON、代码围栏或反复试错过程。LaTeX 直接使用普通单反斜杠，不作 JSON 转义。只选择以下一个格式，各标记独占一行：
<<<EXPLANATION>>>
先完成必要且完整的推导，公式用 $...$ 或 $$...$$
<<<ANSWER>>>
最后给出与上述推导一致的简短最终答案（证明题写结论）
<<<END>>>
若原图与输入题干不一致、条件不足或无法可靠完成，停止解题，改用：
<<<ISSUE>>>
具体指出不一致/缺失或不能完成的原因；不要臆造答案。
<<<END>>>
输出前核对导数符号位置、正负号、区间和题目目标；不得将相减变相加、凭空添加边界条件。` +
      (scoring
        ? `
答案与得分点必须在同一次输出中完成：在 ANSWER 后、END 前增加 RUBRIC 标记。${scoring.required ? `RUBRIC 内容严格三行，每行“分数 | 一句简洁具体的评分标准”，合计 ${scoring.defaultScore} 分，不展开完整解题过程。` : '这是选填题，RUBRIC 内容只写 NONE。'}
<<<RUBRIC>>>
${scoring.required ? '3 | 关键思路标准\n4 | 主要推导标准\n3 | 最终结论标准' : 'NONE'}
<<<END>>>`
        : ''),
    parseText(raw) {
      if (scoring && !raw.trim().startsWith('<<<ISSUE>>>')) {
        const match = raw.trim().match(/\n<<<RUBRIC>>>\r?\n([\s\S]+?)\r?\n<<<END>>>$/);
        if (!match) throw new Error('Missing scoring section');
        const answer = Result.parse(
          answerOutput(childIndex).parseText!(raw.trim().slice(0, match.index) + '\n<<<END>>>'),
        );
        const points = scoring.required
          ? Scoring.parse(
              rubricOutput(scoring.defaultScore).parseText!(
                '<<<RUBRIC>>>\n' + match[1] + '\n<<<END>>>',
              ),
            )
          : match[1]!.trim() === 'NONE'
            ? { defaultScore: scoring.defaultScore, rubric: [] }
            : null;
        if (!points) throw new Error('Objective answers must have an empty rubric');
        return { ...answer, scoring: points };
      }
      if (raw.length > 32000 || /[\t ]{100}|\n{20}/u.test(raw))
        throw new Error('Degenerate answer output');
      const text = raw.trim();
      if ((text.match(/不对|等下|我之前|重新来/gu)?.length ?? 0) >= 3)
        throw new Error('Unresolved self-correction draft');
      const markers = text.match(/^<<<[A-Z]+>>>\r?$/gm) ?? [];
      const issue = text.match(/^<<<ISSUE>>>\r?\n([\s\S]+?)\r?\n<<<END>>>$/);
      if (issue && markers.length === 2)
        return { text: '', explanation: '', issue: issue[1]!.trim() };
      // Read legacy records as well; new requests derive first to avoid anchoring
      // the model on a guessed answer before it has completed the calculation.
      const derived = text.match(
        /^<<<EXPLANATION>>>\r?\n([\s\S]+?)\r?\n<<<ANSWER>>>\r?\n([\s\S]+?)\r?\n<<<END>>>$/,
      );
      if (derived && markers.length === 3 && derived[1]!.trim() && derived[2]!.trim())
        return { text: derived[2]!.trim(), explanation: derived[1]!.trim(), issue: '' };
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
        : {
            answers: [
              {
                childIndex,
                text: v.text,
                explanation: v.explanation,
                ...(v.scoring ? { scoring: v.scoring } : {}),
              },
            ],
            issues: [],
          };
    },
  };
}
