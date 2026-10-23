import { Module } from '@nestjs/common';
import { JobExecutionModule } from '../../modules/job-execution/job-execution.module.js';

@Module({ imports: [JobExecutionModule] })
export class InternalApiModule {}
