import { z } from 'zod';
import { allocateScores } from '../../textbooks/domain/score-allocation.js';
import type { OutputContract } from '../../../ai/ports/skills.js';
import { SubjectiveScoring } from '../../textbooks/domain/grading.js';
export const RubricResult = z.union([
  SubjectiveScoring,
  z.strictObject({ issue: z.string().min(1) }),
]);
export function rubricOutput(defaultScore: number): OutputContract {
  return {
    schema: RubricResult,
    maxOutputTokens: 1800,
    instructions: `只输出以下文本格式，严格三条得分点，每条只写一句核心判分标准，不展开解题过程，每条独占一行，分数为正整数，合计 ${defaultScore} 分。不要 JSON、围栏或额外说明。公式直接使用单反斜杠。\n<<<RUBRIC>>>\n分数 | 本题的具体判分标准\n分数 | 本题的另一个具体判分标准\n分数 | 本题的关键结论\n<<<END>>>\n遇到无法确定或明确矛盾改用：\n<<<ISSUE>>>\n具体原因\n<<<END>>>`,
    parseText(raw) {
      const issue = raw.trim().match(/^<<<ISSUE>>>\s*\n([\s\S]+?)\n<<<END>>>$/);
      if (issue) return { issue: issue[1]!.trim().slice(0, 2000) };
      const match = raw.trim().match(/^<<<RUBRIC>>>\s*\n([\s\S]+?)\n<<<END>>>$/);
      if (!match) throw new Error('Missing rubric envelope');
      const rubric = match[1]!
        .split(/\r?\n/)
        .filter((s) => s.trim())
        .map((line, i) => {
          const row = line.match(/^\s*([1-9]\d*)\s*[|｜]\s*(.+)$/);
          if (!row) throw new Error('Each rubric point must occupy one score | criteria line');
          return {
            rubricItemKey: `key_${i + 1}`,
            maxScore: Number(row[1]),
            criteria: row[2]!.trim(),
          };
        });
      const scores = allocateScores(
        rubric.map((r) => r.maxScore),
        defaultScore,
      );
      return SubjectiveScoring.parse({
        defaultScore,
        rubric: rubric.map((r, i) => ({ ...r, maxScore: scores[i] })),
      });
    },
    decode(value) {
      return RubricResult.parse(value);
    },
  };
}
