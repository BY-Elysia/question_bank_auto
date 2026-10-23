import { Module } from '@nestjs/common';
import { RegistryController } from './presentation/registry.controller.js';
import { REGISTRY_SERVICE } from './application/registry.service.interface.js';
import { RegistryUnimplementedService } from './infrastructure/registry.unimplemented.service.js';

@Module({
  controllers: [RegistryController],
  providers: [{ provide: REGISTRY_SERVICE, useClass: RegistryUnimplementedService }],
  exports: [REGISTRY_SERVICE],
})
export class RegistryModule {}
