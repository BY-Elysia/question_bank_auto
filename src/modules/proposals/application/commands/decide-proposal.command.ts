import type { Proposal } from '../../domain/proposal.js';
import type { ProposalDecision } from '../dto/proposal-decision.js';

/** 应用或拒绝候选修改. Runtime validation is not implemented yet. */
export interface DecideProposalInput {
  path: {
    proposalId: string;
  };
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
  body: ProposalDecision;
}

export type DecideProposalResult = Proposal;
