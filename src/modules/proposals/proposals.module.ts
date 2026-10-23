import { Module } from '@nestjs/common';
import { ProposalsController } from './presentation/proposals.controller.js';
import { PROPOSALS_SERVICE } from './application/proposals.service.interface.js';
import { ProposalsUnimplementedService } from './infrastructure/proposals.unimplemented.service.js';

@Module({
  controllers: [ProposalsController],
  providers: [{ provide: PROPOSALS_SERVICE, useClass: ProposalsUnimplementedService }],
  exports: [PROPOSALS_SERVICE],
})
export class ProposalsModule {}
