import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PROPOSALS_SERVICE } from '../application/proposals.service.interface.js';
import type { ProposalsService } from '../application/proposals.service.interface.js';
import type {
  ListDocumentProposalsInput,
  ListDocumentProposalsResult,
} from './dto/list-document-proposals.dto.js';
import type { GetProposalInput, GetProposalResult } from './dto/get-proposal.dto.js';
import type { DecideProposalInput, DecideProposalResult } from './dto/decide-proposal.dto.js';

@Controller()
export class ProposalsController {
  constructor(@Inject(PROPOSALS_SERVICE) private readonly service: ProposalsService) {}

  /** 列出模型或组卷修改建议 */
  @Get('api/v1/documents/:documentId/proposals')
  @HttpCode(200)
  listDocumentProposals(
    @Param() path: ListDocumentProposalsInput['path'],
    @Query() query: ListDocumentProposalsInput['query'],
  ): Promise<ListDocumentProposalsResult> {
    return this.service.listDocumentProposals({ path, query });
  }

  /** 读取候选修改与校验结果 */
  @Get('api/v1/proposals/:proposalId')
  @HttpCode(200)
  getProposal(@Param() path: GetProposalInput['path']): Promise<GetProposalResult> {
    return this.service.getProposal({ path });
  }

  /** 应用或拒绝候选修改 */
  @Post('api/v1/proposals/:proposalId/decision')
  @HttpCode(200)
  decideProposal(
    @Param() path: DecideProposalInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: DecideProposalInput['body'],
  ): Promise<DecideProposalResult> {
    return this.service.decideProposal({
      path,
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
      body,
    });
  }
}
