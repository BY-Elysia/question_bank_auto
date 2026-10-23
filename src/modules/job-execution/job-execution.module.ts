import { Module } from '@nestjs/common';
import { JobExecutionController } from './presentation/job-execution.controller.js';
import { JOB_EXECUTION_SERVICE } from './application/job-execution.service.interface.js';
import { JobExecutionUnimplementedService } from './infrastructure/job-execution.unimplemented.service.js';

@Module({
  controllers: [JobExecutionController],
  providers: [{ provide: JOB_EXECUTION_SERVICE, useClass: JobExecutionUnimplementedService }],
  exports: [JOB_EXECUTION_SERVICE],
})
export class JobExecutionModule {}
