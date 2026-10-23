import { Module } from '@nestjs/common';
import { GatewayModule } from '../../ai/gateway/gateway.module.js';

@Module({ imports: [GatewayModule] })
export class ModelGatewayModule {}
