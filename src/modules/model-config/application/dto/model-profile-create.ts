import type { ModelParameters } from '../../domain/model-parameters.js';
import type { ModelRole } from '../../domain/model-role.js';

/** credentialId=null 使用用户获授权的平台凭证；模型能力必须匹配 role 和 Skill。 */
export type ModelProfileCreate = {
  name: string;
  role: ModelRole;
  providerId: string;
  modelId: string;
  credentialId: string | null;
  parameters: ModelParameters;
};
