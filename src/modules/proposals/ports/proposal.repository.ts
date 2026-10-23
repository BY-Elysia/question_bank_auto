import type { UserScope } from '../../../shared/contracts/identity-context.js';
import type { Proposal } from '../domain/proposal.js';

export const PROPOSAL_REPOSITORY = Symbol('PROPOSAL_REPOSITORY');

export interface ProposalRepository {
  find(scope: UserScope, proposalId: string): Promise<Proposal | null>;
  /** Applies all changes and records the decision in one document transaction. */
  decide(
    scope: UserScope,
    proposalId: string,
    expectedDocumentRevision: number,
    decision: 'apply' | 'reject',
  ): Promise<Proposal>;
}
