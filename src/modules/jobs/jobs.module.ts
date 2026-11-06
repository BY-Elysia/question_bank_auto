import { Module, type DynamicModule } from '@nestjs/common';
import { JobsController, JOBS } from './presentation/jobs.controller.js';
import type { JobsService } from './application/jobs.service.js';
@Module({})
export class JobsModule {
  static register(jobs: JobsService): DynamicModule {
    return {
      module: JobsModule,
      controllers: [JobsController],
      providers: [{ provide: JOBS, useValue: jobs }],
    };
  }
}
