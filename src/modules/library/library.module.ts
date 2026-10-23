import { Module } from '@nestjs/common';
import { LibraryController } from './presentation/library.controller.js';
import { LIBRARY_SERVICE } from './application/library.service.interface.js';
import { LibraryUnimplementedService } from './infrastructure/library.unimplemented.service.js';

@Module({
  controllers: [LibraryController],
  providers: [{ provide: LIBRARY_SERVICE, useClass: LibraryUnimplementedService }],
  exports: [LIBRARY_SERVICE],
})
export class LibraryModule {}
