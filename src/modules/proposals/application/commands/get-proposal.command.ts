import type { Proposal } from '../../domain/proposal.js';

/** 读取候选修改与校验结果. Runtime validation is not implemented yet. */
export interface GetProposalInput {
  path: {
    proposalId: string;
  };
}

export type GetProposalResult = Proposal;
