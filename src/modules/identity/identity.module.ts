import { Module } from '@nestjs/common';
import { IdentityController } from './presentation/identity.controller.js';
import { IDENTITY_SERVICE } from './application/identity.service.interface.js';
import { IdentityUnimplementedService } from './infrastructure/identity.unimplemented.service.js';

@Module({
  controllers: [IdentityController],
  providers: [{ provide: IDENTITY_SERVICE, useClass: IdentityUnimplementedService }],
  exports: [IDENTITY_SERVICE],
})
export class IdentityModule {}
