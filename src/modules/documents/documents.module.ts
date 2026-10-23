import { Module } from '@nestjs/common';
import { DocumentsController } from './presentation/documents.controller.js';
import { DOCUMENTS_SERVICE } from './application/documents.service.interface.js';
import { DocumentsUnimplementedService } from './infrastructure/documents.unimplemented.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [{ provide: DOCUMENTS_SERVICE, useClass: DocumentsUnimplementedService }],
  exports: [DOCUMENTS_SERVICE],
})
export class DocumentsModule {}
