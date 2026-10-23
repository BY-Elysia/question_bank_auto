import type { SkillIssue } from '../../../runtime/contracts/skill-issue.js';

/** 只能引用本次工具调用实际返回、当前用户有权访问的题目版本。 */
export type LibrarySearchOutput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'question-bank-search';
  /** @enum {string} */
  status: 'completed' | 'needs_input';
  questionVersionIds: string[];
  explanation: string;
  issues: SkillIssue[];
};
