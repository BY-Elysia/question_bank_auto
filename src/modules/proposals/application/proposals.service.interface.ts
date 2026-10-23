import type {
  ListDocumentProposalsInput,
  ListDocumentProposalsResult,
} from './commands/list-document-proposals.command.js';
import type { GetProposalInput, GetProposalResult } from './commands/get-proposal.command.js';
import type {
  DecideProposalInput,
  DecideProposalResult,
} from './commands/decide-proposal.command.js';

export const PROPOSALS_SERVICE = Symbol('PROPOSALS_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface ProposalsService {
  listDocumentProposals(input: ListDocumentProposalsInput): Promise<ListDocumentProposalsResult>;
  getProposal(input: GetProposalInput): Promise<GetProposalResult>;
  decideProposal(input: DecideProposalInput): Promise<DecideProposalResult>;
}
