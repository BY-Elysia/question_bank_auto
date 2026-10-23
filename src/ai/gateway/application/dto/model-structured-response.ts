import type { SkillOutput } from '../../../runtime/contracts/skill-output.js';
import type { Usage } from '../../../../modules/model-config/domain/usage.js';

/** ModelStructuredResponse contract. */
export type ModelStructuredResponse = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'structured';
  /** Format: uuid */
  invocationId: string;
  output: SkillOutput;
  usage: Usage;
};
