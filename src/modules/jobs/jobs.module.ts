import { Module, type DynamicModule } from '@nestjs/common';
import { JobsController, JOBS, STORE } from './presentation/jobs.controller.js';
import type { JobsService } from './application/jobs.service.js';
import type { BookStore } from '../textbooks/infrastructure/book-store.js';
@Module({})
export class JobsModule {
  static register(jobs: JobsService, store: BookStore): DynamicModule {
    return {
      module: JobsModule,
      controllers: [JobsController],
      providers: [
        { provide: JOBS, useValue: jobs },
        { provide: STORE, useValue: store },
      ],
    };
  }
}
