import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { ProposalsService } from '../application/proposals.service.interface.js';
import type {
  ListDocumentProposalsInput,
  ListDocumentProposalsResult,
} from '../application/commands/list-document-proposals.command.js';
import type {
  GetProposalInput,
  GetProposalResult,
} from '../application/commands/get-proposal.command.js';
import type {
  DecideProposalInput,
  DecideProposalResult,
} from '../application/commands/decide-proposal.command.js';

@Injectable()
export class ProposalsUnimplementedService implements ProposalsService {
  async listDocumentProposals(
    _input: ListDocumentProposalsInput,
  ): Promise<ListDocumentProposalsResult> {
    throw new OperationNotImplemented('listDocumentProposals');
  }

  async getProposal(_input: GetProposalInput): Promise<GetProposalResult> {
    throw new OperationNotImplemented('getProposal');
  }

  async decideProposal(_input: DecideProposalInput): Promise<DecideProposalResult> {
    throw new OperationNotImplemented('decideProposal');
  }
}
