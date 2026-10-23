import type { ValidationIssue } from '../../../../modules/documents/domain/validation-issue.js';

/** targetSchemaRef 仅允许当前计划中非 structured-output-repair Skill 的输出 schema；修复预算继承父步骤。 */
export type StructuredRepairInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'structured-output-repair';
  targetSchemaRef: string;
  rawOutput: string;
  errors: ValidationIssue[];
  sourceAssetIds: string[];
};
