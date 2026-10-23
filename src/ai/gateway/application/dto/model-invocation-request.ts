import type { LeaseContext } from '../../../../modules/job-execution/domain/lease-context.js';
import type { ModelMessage } from '../../domain/model-message.js';
import type { SkillId } from '../../../runtime/contracts/skill-id.js';

/** 配置、密钥、允许工具、Token 预算从冻结 plan 解析。schemaRef 必须匹配 Skill 输出（结构修复例外受目标白名单约束）。禁止客户端提供 baseUrl、密钥、ownerId 或任意工具定义。callIndex 纳入幂等键。 */
export type ModelInvocationRequest = {
  lease: LeaseContext;
  /** Format: uuid */
  stepId: string;
  skillId: SkillId;
  skillVersion: string;
  callIndex: number;
  messages: ModelMessage[];
  schemaRef: string;
};
