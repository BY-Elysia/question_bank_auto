import { imageUploadStorage } from './image-upload.js';
import {
  Controller,
  Get,
  Delete,
  Post,
  Param,
  Body,
  Query,
  Inject,
  HttpCode,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { WorkspacesService } from '../application/workspaces.service.js';
import { WorkspaceView } from '../application/workspace-view.js';
import { ExtractionSettings } from '../domain/workspace.js';
import { fail, parse } from '../../../shared/errors.js';
export const WORKSPACES = Symbol('WORKSPACES'),
  WORKSPACE_VIEW = Symbol('WORKSPACE_VIEW');
const Title = z.string().trim().min(1).max(300);
@Controller('api/workspaces')
export class WorkspacesController {
  constructor(
    @Inject(WORKSPACES) private workspaces: WorkspacesService,
    @Inject(WORKSPACE_VIEW) private view: WorkspaceView,
  ) {}
  @Get() list() {
    return this.workspaces.list();
  }
  @Post('pdf') @HttpCode(202) pdf(@Body() body: unknown, @Query('title') title: unknown) {
    if (!Buffer.isBuffer(body)) fail(400, 'Send application/pdf');
    return this.workspaces.uploadPdf(body, parse(Title, title));
  }
  @Post('images')
  @UseInterceptors(
    FilesInterceptor('images', 500, {
      storage: imageUploadStorage,
      limits: { fileSize: 20 * 1024 * 1024, files: 500, fields: 0 },
    }),
  )
  images(@UploadedFiles() files: { buffer: Buffer }[], @Query('title') title: unknown) {
    return this.workspaces.uploadImages(
      (files ?? []).map((f) => f.buffer),
      parse(Title, title),
    );
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.view.get(id);
  }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) {
    return this.workspaces.remove(id);
  }
  @Post(':id/extract') @HttpCode(202) extract(@Param('id') id: string, @Body() body: unknown) {
    return this.workspaces.extract(id, parse(ExtractionSettings, body));
  }
  @Post(':id/resume') @HttpCode(202) resume(@Param('id') id: string) {
    return this.workspaces.resume(id);
  }
  @Post(':id/cancel') @HttpCode(200) cancel(@Param('id') id: string) {
    return this.workspaces.cancel(id);
  }
}
