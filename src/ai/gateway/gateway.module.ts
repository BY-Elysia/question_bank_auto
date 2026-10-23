import { Module } from '@nestjs/common';
import { GatewayController } from './presentation/gateway.controller.js';
import { GATEWAY_SERVICE } from './application/gateway.service.interface.js';
import { GatewayUnimplementedService } from './infrastructure/gateway.unimplemented.service.js';

@Module({
  controllers: [GatewayController],
  providers: [{ provide: GATEWAY_SERVICE, useClass: GatewayUnimplementedService }],
  exports: [GATEWAY_SERVICE],
})
export class GatewayModule {}
