import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkspaceWorkerModule } from './workspace-worker.module.js';

const app = await NestFactory.createApplicationContext(WorkspaceWorkerModule, { logger: false });
console.log('Workspace Worker modules initialized. Queue consumption is not implemented; exiting.');
await app.close();
