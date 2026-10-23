import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** repairedJson 解析后必须再次按 targetSchemaRef 校验；字符串不是可跳过校验的任意写入入口。 */
export type StructuredRepairOutput = {
  /** @enum {string} */
  kind: 'structured-output-repair';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  repairedJson: string | null;
  issues: SkillIssue[];
} & (unknown & {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'structured-output-repair';
});
