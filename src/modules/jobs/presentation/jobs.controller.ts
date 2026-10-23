import { Controller, Get, Post, Param, Body, Inject, HttpCode } from '@nestjs/common';
import { JobsService } from '../application/jobs.service.js';
import { BookStore } from '../../textbooks/infrastructure/book-store.js';
import { JobRequest } from '../domain/job.js';
import { parse } from '../../../shared/errors.js';
export const JOBS = Symbol('JOBS'),
  STORE = Symbol('STORE');
@Controller('api/textbooks/:id/jobs')
export class JobsController {
  constructor(
    @Inject(JOBS) private jobs: JobsService,
    @Inject(STORE) private store: BookStore,
  ) {}
  @Post() @HttpCode(202) start(@Param('id') id: string, @Body() body: unknown) {
    return this.jobs.start(id, parse(JobRequest, body));
  }
  @Get() async list(@Param('id') id: string) {
    return (await this.store.read(id)).jobs.map(({ stage, ...job }) => job);
  }
  @Get(':jobId') async get(@Param('id') id: string, @Param('jobId') jobId: string) {
    return this.jobs.find(await this.store.read(id), jobId);
  }
  @Post(':jobId/cancel') @HttpCode(200) cancel(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.cancel(id, jobId);
  }
  @Post(':jobId/resume') @HttpCode(202) resume(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.resume(id, jobId);
  }
}
