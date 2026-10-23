import type { PageInfo } from '../../../../shared/contracts/page-info.js';
import type { Proposal } from '../../domain/proposal.js';

/** ProposalPage contract. */
export type ProposalPage = {
  items: Proposal[];
  page: PageInfo;
};
