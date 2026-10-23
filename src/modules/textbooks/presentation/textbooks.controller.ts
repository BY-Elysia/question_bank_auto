import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Patch,
  Param,
  Body,
  Query,
  Res,
  Inject,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { TextbooksService } from '../application/textbooks.service.js';
import { ExportService } from '../application/export.service.js';
import { ReviewService } from '../../review/application/review.service.js';
import { validateDocument } from '../domain/validation.js';
import { ReplaceDocument, EditContent, Decision, Restore } from './contracts.js';
import { fail, parse } from '../../../shared/errors.js';
export const TEXTBOOKS = Symbol('TEXTBOOKS'),
  EXPORTS = Symbol('EXPORTS'),
  REVIEW = Symbol('REVIEW');
@Controller('api/textbooks')
export class TextbooksController {
  constructor(
    @Inject(TEXTBOOKS) private books: TextbooksService,
    @Inject(EXPORTS) private exports: ExportService,
    @Inject(REVIEW) private review: ReviewService,
  ) {}
  @Get() async list() {
    return (await this.books.store.list()).map((b) => ({
      id: b.id,
      title: b.title,
      revision: b.revision,
      pageCount: b.pages.length,
      updatedAt: b.updatedAt,
    }));
  }
  @Post() async upload(@Body() body: unknown, @Query('title') title: unknown) {
    if (!Buffer.isBuffer(body)) fail(400, 'Send the PDF as application/pdf request body');
    return this.books.upload(body, parse(z.string().trim().min(1).max(300), title));
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.books.store.read(id);
  }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) {
    return this.books.remove(id);
  }
  @Get(':id/source') async source(@Param('id') id: string, @Res() res: Response) {
    res.sendFile(await this.books.asset(id));
  }
  @Get(':id/pages/:page/image') async image(
    @Param('id') id: string,
    @Param('page') page: string,
    @Res() res: Response,
  ) {
    res.sendFile(await this.books.asset(id, parse(z.coerce.number().int().positive(), page)));
  }
  @Get(':id/document') async document(@Param('id') id: string) {
    const book = await this.books.store.read(id);
    return { revision: book.revision, document: book.document };
  }
  @Put(':id/document') replace(@Param('id') id: string, @Body() body: unknown) {
    const input = parse(ReplaceDocument, body);
    return this.review.replace(id, input.expectedRevision, input.document);
  }
  @Patch(':id/contents/:contentId') edit(
    @Param('id') id: string,
    @Param('contentId') contentId: string,
    @Body() body: unknown,
  ) {
    const input = parse(EditContent, body);
    return this.review.edit(id, input.expectedRevision, contentId, input.content);
  }
  @Get(':id/proposals') async proposals(@Param('id') id: string) {
    return (await this.books.store.read(id)).proposals;
  }
  @Post(':id/proposals/:proposalId/decision') @HttpCode(200) decide(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() body: unknown,
  ) {
    const input = parse(Decision, body);
    return this.review.decide(id, proposalId, input.expectedRevision, input.decision);
  }
  @Post(':id/validate') @HttpCode(200) async validate(@Param('id') id: string) {
    const book = await this.books.store.read(id);
    return {
      issues: [
        ...book.document.issues,
        ...validateDocument(book.document, book.pages.length),
        ...book.jobs.filter((j) => j.baseRevision === book.revision).flatMap((j) => j.issues),
      ],
    };
  }
  @Get(':id/revisions') revisions(@Param('id') id: string) {
    return this.review.revisions(id);
  }
  @Post(':id/restore') @HttpCode(200) restore(@Param('id') id: string, @Body() body: unknown) {
    const input = parse(Restore, body);
    return this.review.restore(id, input.expectedRevision, input.revision);
  }
  @Get(':id/export.json') json(@Param('id') id: string) {
    return this.exports.json(id);
  }
  @Get(':id/export.zip') zip(@Param('id') id: string, @Res() res: Response) {
    return this.exports.zip(id, res);
  }
}
