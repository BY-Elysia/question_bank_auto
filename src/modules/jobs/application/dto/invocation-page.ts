import type { ModelInvocationSummary } from '../../domain/model-invocation-summary.js';
import type { PageInfo } from '../../../../shared/contracts/page-info.js';

/** InvocationPage contract. */
export type InvocationPage = {
  items: ModelInvocationSummary[];
  page: PageInfo;
};
