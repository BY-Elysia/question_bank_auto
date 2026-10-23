import { Module } from '@nestjs/common';
import { JobsController } from './presentation/jobs.controller.js';
import { JOBS_SERVICE } from './application/jobs.service.interface.js';
import { JobsUnimplementedService } from './infrastructure/jobs.unimplemented.service.js';

@Module({
  controllers: [JobsController],
  providers: [{ provide: JOBS_SERVICE, useClass: JobsUnimplementedService }],
  exports: [JOBS_SERVICE],
})
export class JobsModule {}
