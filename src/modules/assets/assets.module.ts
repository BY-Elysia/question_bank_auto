import { Module } from '@nestjs/common';
import { AssetsController } from './presentation/assets.controller.js';
import { ASSETS_SERVICE } from './application/assets.service.interface.js';
import { AssetsUnimplementedService } from './infrastructure/assets.unimplemented.service.js';

@Module({
  controllers: [AssetsController],
  providers: [{ provide: ASSETS_SERVICE, useClass: AssetsUnimplementedService }],
  exports: [ASSETS_SERVICE],
})
export class AssetsModule {}
