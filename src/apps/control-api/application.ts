import {
  ChangesController,
  CHANGES,
} from '../../modules/review/presentation/changes.controller.js';
import {
  KnowledgeController,
  KNOWLEDGE,
} from '../../modules/assistant/presentation/knowledge.controller.js';
import { HarnessController } from '../../modules/assistant/presentation/harness.controller.js';
import {
  AssistantModelController,
  ASSISTANT_MODEL,
} from '../../modules/profile/presentation/assistant-model.controller.js';
import {
  QuestionsController,
  INSERTION,
  INSERTION_JOBS,
} from '../../modules/questions/presentation/questions.controller.js';
import {
  ProfileController,
  PROFILE,
} from '../../modules/profile/presentation/profile.controller.js';
import {
  AssistantController,
  ASSISTANT,
} from '../../modules/assistant/presentation/assistant.controller.js';
import { accessConfig, accessGate } from '../../shared/auth/gate.js';
import { FileSessionStore } from '../../shared/auth/file-session-store.js';
import 'reflect-metadata';
import { WorkspacesModule } from '../../modules/workspaces/workspaces.module.js';
import {
  Inject,
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
import fs from 'node:fs';
import type { Request, NextFunction } from 'express';
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
  constructor(
    @Inject(PROFILE)
    private profile: import('../../modules/profile/application/profile.service.js').ProfileService,
  ) {}
  @Get('health') async health() {
    const config = await this.profile.get();
    return {
      status: 'ok',
      mode: 'single-workspace',
      modelConfigured: Boolean(config.hasApiKey && config.model),
    };
  }
}
export async function createApplication(options: AppOptions = {}) {
  const root = path.resolve(options.root ?? process.env.WORKSPACE_ROOT ?? './workspace');
  const access = options.access ?? accessConfig();
  const sessions = access
    ? await FileSessionStore.open(
        path.join(root, 'access', 'sessions.json'),
        access.username,
        access.passwordHash,
      )
    : undefined;
  const services = await createServices({ ...options, root });
  const { books, review, exports, jobs, workspaces, workspaceView } = services;
  @Module({
    imports: [
      TextbooksModule.register(books, exports, review),
      JobsModule.register(jobs),
      WorkspacesModule.register(workspaces, workspaceView),
    ],
    controllers: [
      ChangesController,
      KnowledgeController,
      HarnessController,
      AssistantModelController,
      HealthController,
      ProfileController,
      AssistantController,
      QuestionsController,
    ],
    providers: [
      { provide: CHANGES, useValue: services.changes },
      { provide: KNOWLEDGE, useValue: services.knowledge },
      { provide: ASSISTANT_MODEL, useValue: services.assistantConfiguration },
      { provide: PROFILE, useValue: services.profile },
      { provide: INSERTION, useValue: services.insertion },
      { provide: INSERTION_JOBS, useValue: jobs },
      { provide: ASSISTANT, useValue: services.assistant },
      {
        provide: 'BACKGROUND_WORK_SHUTDOWN',
        useValue: {
          async onModuleDestroy() {
            await workspaces.shutdown();
            await services.assistant.shutdown();
            await jobs.shutdown();
            services.knowledge.close();
          },
        },
      },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  app.use('/api/access', express.json({ limit: '2kb' }));
  app.use(accessGate(access, sessions));
  app.use(express.raw({ type: 'application/pdf', limit: process.env.MAX_UPLOAD_SIZE ?? '100mb' }));
  app.use(express.json({ limit: '20mb' }));
  // Serve build-time Brotli without spending CPU on each request. The whitelist
  // limits this to public hashed assets; API responses and private images bypass it.
  app.use('/assets', (req: Request, res: Response, next: NextFunction) => {
    if (
      !/^[\w./-]+$/.test(req.path) ||
      !/^\/[\w-]+\.(js|css)$/.test(req.path) ||
      !req.acceptsEncodings('br')
    )
      return next();
    const file = path.resolve(
      process.env.WEB_ROOT ?? './client/dist',
      'assets',
      req.path.slice(1) + '.br',
    );
    if (!fs.existsSync(file)) return next();
    res.setHeader('Content-Encoding', 'br');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(req.path.endsWith('.css') ? 'text/css' : 'application/javascript');
    res.sendFile(file);
  });
  app.use(
    express.static(path.resolve(process.env.WEB_ROOT ?? './client/dist'), {
      setHeaders(res, file) {
        res.setHeader(
          'Cache-Control',
          /[/\\]assets[/\\]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  app.useGlobalFilters(new Errors());
  return { app, ...services };
}
