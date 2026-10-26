import 'reflect-metadata';
import { WorkspacesModule } from '../../modules/workspaces/workspaces.module.js';
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
import path from 'node:path';
import type { Response } from 'express';
import { DomainError } from '../../shared/errors.js';
import { ZodError } from 'zod';
import { createServices, type AppOptions } from './services.js';
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
export async function createApplication(options: AppOptions = {}) {
  const services = await createServices(options);
  const { books, review, exports, jobs, workspaces, workspaceView } = services;
  @Module({
    imports: [
      TextbooksModule.register(books, exports, review),
      JobsModule.register(jobs),
      WorkspacesModule.register(workspaces, workspaceView),
    ],
    controllers: [HealthController],
    providers: [
      {
        provide: 'BACKGROUND_WORK_SHUTDOWN',
        useValue: {
          async onModuleDestroy() {
            await workspaces.shutdown();
            await jobs.shutdown();
          },
        },
      },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  app.use(express.raw({ type: 'application/pdf', limit: process.env.MAX_UPLOAD_SIZE ?? '100mb' }));
  app.use(express.json({ limit: '20mb' }));
  app.use(express.static(path.resolve(process.env.WEB_ROOT ?? './client/dist')));
  app.useGlobalFilters(new Errors());
  return { app, ...services };
}
