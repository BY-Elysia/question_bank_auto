import type { SkillBinding } from '../../model-config/domain/skill-binding.js';
import type { VersionReference } from '../../../shared/contracts/version-reference.js';

/** 配置和版本冻结；凭证引用不变但读取该凭证当前有效密钥，轮换立即生效，撤销后禁止调用。 */
export type ExecutionPlan = {
  workflow: VersionReference;
  applicationBuild: string;
  /** @enum {string} */
  directoryLayoutVersion: '1';
  skillBindings: SkillBinding[];
  tools: VersionReference[];
  maxModelCalls: number;
  maxToolCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxAttemptsPerStep: number;
  /** Format: date-time */
  deadlineAt: string;
  /** @enum {string} */
  credentialPolicy: 'current-secret-with-frozen-reference';
};
