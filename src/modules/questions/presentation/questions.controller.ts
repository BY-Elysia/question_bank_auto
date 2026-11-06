import {
  Controller,
  Post,
  Param,
  Query,
  Inject,
  HttpCode,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { QuestionInsertion } from '../application/question-insertion.js';
import { JobsService } from '../../jobs/application/jobs.service.js';
import { imageUploadStorage } from '../../workspaces/presentation/image-upload.js';
import { Id } from '../../textbooks/domain/content.js';
import { parse, fail } from '../../../shared/errors.js';
export const INSERTION = Symbol('INSERTION'),
  INSERTION_JOBS = Symbol('INSERTION_JOBS');
@Controller('api/workspaces')
export class QuestionsController {
  constructor(
    @Inject(INSERTION) private insertion: QuestionInsertion,
    @Inject(INSERTION_JOBS) private jobs: JobsService,
  ) {}
  @Post(':id/questions/:anchor/image')
  @HttpCode(202)
  @UseInterceptors(
    FilesInterceptor('images', 1, {
      storage: imageUploadStorage,
      limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(
    @Param('id') id: string,
    @Param('anchor') anchor: string,
    @Query() query: unknown,
    @UploadedFiles() files: { buffer: Buffer }[],
  ) {
    const params = parse(
      z.object({
        position: z.enum(['before', 'after']),
        revision: z.coerce.number().int().nonnegative(),
      }),
      query,
    );
    if (files?.length !== 1) fail(400, 'Upload one question image');
    return this.insertion.upload(
      id,
      parse(Id, anchor),
      params.position,
      files[0]!.buffer,
      params.revision,
      this.jobs,
    );
  }
}
