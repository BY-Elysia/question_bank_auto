import { Module } from '@nestjs/common';
import { ModelConfigController } from './presentation/model-config.controller.js';
import { MODEL_CONFIG_SERVICE } from './application/model-config.service.interface.js';
import { ModelConfigUnimplementedService } from './infrastructure/model-config.unimplemented.service.js';

@Module({
  controllers: [ModelConfigController],
  providers: [{ provide: MODEL_CONFIG_SERVICE, useClass: ModelConfigUnimplementedService }],
  exports: [MODEL_CONFIG_SERVICE],
})
export class ModelConfigModule {}
