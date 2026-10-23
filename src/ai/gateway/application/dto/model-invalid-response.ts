import type { Usage } from '../../../../modules/model-config/domain/usage.js';
import type { ValidationIssue } from '../../../../modules/documents/domain/validation-issue.js';

/** HTTP 成功仅表示完成调用。无效模型内容以此分支返回，由工作流读取原始产物并进入受预算约束的修复步骤。 */
export type ModelInvalidResponse = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'invalid_output';
  /** Format: uuid */
  invocationId: string;
  /** Format: uuid */
  rawOutputArtifactId: string;
  issues: ValidationIssue[];
  usage: Usage;
};
