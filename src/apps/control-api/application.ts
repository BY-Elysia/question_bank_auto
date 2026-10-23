import 'reflect-metadata';
import {
  Module,
  Controller,
  Get,
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import type { Response } from 'express';
import { DomainError } from '../../shared/errors.js';
import { ZodError } from 'zod';
import { BookStore } from '../../modules/textbooks/infrastructure/book-store.js';
import { PageImages } from '../../modules/textbooks/infrastructure/page-images.js';
import { PdfRenderer } from '../../modules/textbooks/infrastructure/pdf-renderer.js';
import { TextbooksService } from '../../modules/textbooks/application/textbooks.service.js';
import { ExportService } from '../../modules/textbooks/application/export.service.js';
import { ReviewService } from '../../modules/review/application/review.service.js';
import { ReviewWorkflow } from '../../modules/review/application/review-workflow.js';
import { JobsService } from '../../modules/jobs/application/jobs.service.js';
import { TextbookWorkflow } from '../../ai/workflows/textbook-extraction/workflow.js';
import { SkillRunner, type Skills } from '../../ai/runtime/skill-runner.js';
import { HttpModelClient, type ModelClient } from '../../ai/providers/model-client.js';
import { TextbooksModule } from '../../modules/textbooks/textbooks.module.js';
import { JobsModule } from '../../modules/jobs/jobs.module.js';
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof DomainError
          ? error.status
          : error instanceof ZodError
            ? 422
            : (error as { type?: string })?.type === 'entity.too.large'
              ? 413
              : (error as { type?: string })?.type === 'entity.parse.failed'
                ? 400
                : 500;
    const detail =
      error instanceof HttpException
        ? error.getResponse()
        : error instanceof DomainError
          ? error.message
          : status === 422
            ? 'Stored or returned data failed schema validation'
            : 'Request failed; see server logs';
    if (status >= 500) console.error(error);
    response
      .status(status)
      .type('application/problem+json')
      .json({ status, title: status >= 500 ? 'Internal error' : 'Invalid request', detail });
  }
}
@Controller('api')
class HealthController {
  @Get('health') health() {
    return {
      status: 'ok',
      mode: 'single-workspace',
      modelConfigured: Boolean(
        (process.env.MODEL_API_KEY || process.env.ARK_API_KEY) &&
        (process.env.MODEL_NAME || process.env.ARK_MODEL || process.env.VISION_MODEL),
      ),
    };
  }
}
export async function createApplication(
  options: { root?: string; skills?: Skills; model?: ModelClient; pdf?: PdfRenderer } = {},
) {
  const store = new BookStore(options.root ?? process.env.WORKSPACE_ROOT ?? './workspace');
  await store.init();
  const pdf = options.pdf ?? new PdfRenderer(),
    images = new PageImages(store, pdf);
  const skills =
    options.skills ?? new SkillRunner(store, options.model ?? new HttpModelClient(), images);
  const books = new TextbooksService(store, pdf, images);
  const review = new ReviewService(store),
    exports = new ExportService(store, images);
  const jobs = new JobsService(
    store,
    new TextbookWorkflow(store, skills),
    new ReviewWorkflow(store, skills),
  );
  await jobs.recover();
  @Module({
    imports: [TextbooksModule.register(books, exports, review), JobsModule.register(jobs, store)],
    controllers: [HealthController],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  app.use(express.raw({ type: 'application/pdf', limit: process.env.MAX_UPLOAD_SIZE ?? '100mb' }));
  app.use(express.json({ limit: '20mb' }));
  app.useGlobalFilters(new Errors());
  const originalClose = app.close.bind(app);
  app.close = async () => {
    await jobs.shutdown();
    return originalClose();
  };
  return { app, store, books, jobs, review, exports };
}
