import type { LeaseContext } from '../../../../modules/job-execution/domain/lease-context.js';
import type { SkillId } from '../../../runtime/contracts/skill-id.js';
import type { ToolCall } from '../../../runtime/contracts/tool-call.js';

/** 调用必须匹配该 invocation 实际返回且尚未执行的 toolCallId；校验 Skill allowlist 和资源归属。确定性 Workflow 直接调用应用服务，不伪造模型 tool call。 */
export type ToolExecutionRequest = {
  lease: LeaseContext;
  /** Format: uuid */
  stepId: string;
  skillId: SkillId;
  /** Format: uuid */
  invocationId: string;
  toolCallId: string;
  call: ToolCall;
};
