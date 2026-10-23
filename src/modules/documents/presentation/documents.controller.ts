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
import { DOCUMENTS_SERVICE } from '../application/documents.service.interface.js';
import type { DocumentsService } from '../application/documents.service.interface.js';
import type { CreateDocumentInput, CreateDocumentResult } from './dto/create-document.dto.js';
import type { ListDocumentsInput, ListDocumentsResult } from './dto/list-documents.dto.js';
import type { GetDocumentInput, GetDocumentResult } from './dto/get-document.dto.js';
import type {
  ReplaceDocumentContentInput,
  ReplaceDocumentContentResult,
} from './dto/replace-document-content.dto.js';
import type { ValidateDocumentInput, ValidateDocumentResult } from './dto/validate-document.dto.js';
import type {
  ListDocumentRevisionsInput,
  ListDocumentRevisionsResult,
} from './dto/list-document-revisions.dto.js';
import type {
  GetDocumentRevisionInput,
  GetDocumentRevisionResult,
} from './dto/get-document-revision.dto.js';
import type {
  RestoreDocumentRevisionInput,
  RestoreDocumentRevisionResult,
} from './dto/restore-document-revision.dto.js';

@Controller()
export class DocumentsController {
  constructor(@Inject(DOCUMENTS_SERVICE) private readonly service: DocumentsService) {}

  /** 创建空或预填文档 */
  @Post('api/v1/projects/:projectId/documents')
  @HttpCode(201)
  createDocument(
    @Param() path: CreateDocumentInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateDocumentInput['body'],
  ): Promise<CreateDocumentResult> {
    return this.service.createDocument({
      path,
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    });
  }

  /** 列出项目文档 */
  @Get('api/v1/projects/:projectId/documents')
  @HttpCode(200)
  listDocuments(
    @Param() path: ListDocumentsInput['path'],
    @Query() query: ListDocumentsInput['query'],
  ): Promise<ListDocumentsResult> {
    return this.service.listDocuments({ path, query });
  }

  /** 读取当前文档 */
  @Get('api/v1/documents/:documentId')
  @HttpCode(200)
  getDocument(@Param() path: GetDocumentInput['path']): Promise<GetDocumentResult> {
    return this.service.getDocument({ path });
  }

  /** 提交人工编辑后的完整文档 */
  @Put('api/v1/documents/:documentId/content')
  @HttpCode(200)
  replaceDocumentContent(
    @Param() path: ReplaceDocumentContentInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: ReplaceDocumentContentInput['body'],
  ): Promise<ReplaceDocumentContentResult> {
    return this.service.replaceDocumentContent({
      path,
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
      body,
    });
  }

  /** 校验候选文档内容 */
  @Post('api/v1/documents/:documentId/validate')
  @HttpCode(200)
  validateDocument(
    @Param() path: ValidateDocumentInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: ValidateDocumentInput['body'],
  ): Promise<ValidateDocumentResult> {
    return this.service.validateDocument({
      path,
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    });
  }

  /** 列出文档历史快照 */
  @Get('api/v1/documents/:documentId/revisions')
  @HttpCode(200)
  listDocumentRevisions(
    @Param() path: ListDocumentRevisionsInput['path'],
    @Query() query: ListDocumentRevisionsInput['query'],
  ): Promise<ListDocumentRevisionsResult> {
    return this.service.listDocumentRevisions({ path, query });
  }

  /** 读取不可变历史版本 */
  @Get('api/v1/documents/:documentId/revisions/:revision')
  @HttpCode(200)
  getDocumentRevision(
    @Param() path: GetDocumentRevisionInput['path'],
  ): Promise<GetDocumentRevisionResult> {
    return this.service.getDocumentRevision({ path });
  }

  /** 从历史版本创建新的当前版本 */
  @Post('api/v1/documents/:documentId/restore')
  @HttpCode(200)
  restoreDocumentRevision(
    @Param() path: RestoreDocumentRevisionInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: RestoreDocumentRevisionInput['body'],
  ): Promise<RestoreDocumentRevisionResult> {
    return this.service.restoreDocumentRevision({
      path,
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': ifMatch },
      body,
    });
  }
}
