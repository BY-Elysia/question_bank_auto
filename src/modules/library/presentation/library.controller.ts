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
import { LIBRARY_SERVICE } from '../application/library.service.interface.js';
import type { LibraryService } from '../application/library.service.interface.js';
import type { PublishDocumentInput, PublishDocumentResult } from './dto/publish-document.dto.js';
import type { ListPublicationsInput, ListPublicationsResult } from './dto/list-publications.dto.js';
import type { GetPublicationInput, GetPublicationResult } from './dto/get-publication.dto.js';
import type {
  WithdrawPublicationInput,
  WithdrawPublicationResult,
} from './dto/withdraw-publication.dto.js';
import type {
  ListPublicationNodesInput,
  ListPublicationNodesResult,
} from './dto/list-publication-nodes.dto.js';
import type {
  SearchLibraryQuestionsInput,
  SearchLibraryQuestionsResult,
} from './dto/search-library-questions.dto.js';
import type {
  GetLibraryQuestionInput,
  GetLibraryQuestionResult,
} from './dto/get-library-question.dto.js';

@Controller()
export class LibraryController {
  constructor(@Inject(LIBRARY_SERVICE) private readonly service: LibraryService) {}

  /** 发布指定文档版本到题库 */
  @Post('api/v1/publications')
  @HttpCode(201)
  publishDocument(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: PublishDocumentInput['body'],
  ): Promise<PublishDocumentResult> {
    return this.service.publishDocument({ headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 列出当前用户的发布快照 */
  @Get('api/v1/publications')
  @HttpCode(200)
  listPublications(
    @Query() query: ListPublicationsInput['query'],
  ): Promise<ListPublicationsResult> {
    return this.service.listPublications({ query });
  }

  /** 读取来源快照 */
  @Get('api/v1/publications/:publicationId')
  @HttpCode(200)
  getPublication(@Param() path: GetPublicationInput['path']): Promise<GetPublicationResult> {
    return this.service.getPublication({ path });
  }

  /** 撤回已发布快照 */
  @Delete('api/v1/publications/:publicationId')
  @HttpCode(204)
  withdrawPublication(
    @Param() path: WithdrawPublicationInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<WithdrawPublicationResult> {
    return this.service.withdrawPublication({
      path,
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  /** 获取已发布结构节点 */
  @Get('api/v1/publications/:publicationId/nodes')
  @HttpCode(200)
  listPublicationNodes(
    @Param() path: ListPublicationNodesInput['path'],
    @Query() query: ListPublicationNodesInput['query'],
  ): Promise<ListPublicationNodesResult> {
    return this.service.listPublicationNodes({ path, query });
  }

  /** 按确定性条件检索题库 */
  @Post('api/v1/library/questions/search')
  @HttpCode(200)
  searchLibraryQuestions(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: SearchLibraryQuestionsInput['body'],
  ): Promise<SearchLibraryQuestionsResult> {
    return this.service.searchLibraryQuestions({
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    });
  }

  /** 读取不可变题目版本 */
  @Get('api/v1/library/questions/:questionVersionId')
  @HttpCode(200)
  getLibraryQuestion(
    @Param() path: GetLibraryQuestionInput['path'],
  ): Promise<GetLibraryQuestionResult> {
    return this.service.getLibraryQuestion({ path });
  }
}
