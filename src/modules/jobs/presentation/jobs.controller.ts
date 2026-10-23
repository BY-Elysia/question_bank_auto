import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { JOBS_SERVICE } from '../application/jobs.service.interface.js';
import type { JobsService } from '../application/jobs.service.interface.js';
import type { CreateJobInput, CreateJobResult } from './dto/create-job.dto.js';
import type { ListJobsInput, ListJobsResult } from './dto/list-jobs.dto.js';
import type { GetJobInput, GetJobResult } from './dto/get-job.dto.js';
import type { CancelJobInput, CancelJobResult } from './dto/cancel-job.dto.js';
import type { RetryJobInput, RetryJobResult } from './dto/retry-job.dto.js';
import type { ListJobStepsInput, ListJobStepsResult } from './dto/list-job-steps.dto.js';
import type { ListJobEventsInput, ListJobEventsResult } from './dto/list-job-events.dto.js';
import type { StreamJobEventsInput, StreamJobEventsResult } from './dto/stream-job-events.dto.js';
import type {
  ListJobInvocationsInput,
  ListJobInvocationsResult,
} from './dto/list-job-invocations.dto.js';

@Controller()
export class JobsController {
  constructor(@Inject(JOBS_SERVICE) private readonly service: JobsService) {}

  /** 提交后台工作流 */
  @Post('api/v1/projects/:projectId/jobs')
  @HttpCode(202)
  createJob(
    @Param() path: CreateJobInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateJobInput['body'],
  ): Promise<CreateJobResult> {
    return this.service.createJob({ path, headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 列出项目任务 */
  @Get('api/v1/projects/:projectId/jobs')
  @HttpCode(200)
  listJobs(
    @Param() path: ListJobsInput['path'],
    @Query() query: ListJobsInput['query'],
  ): Promise<ListJobsResult> {
    return this.service.listJobs({ path, query });
  }

  /** 获取任务状态与结果 */
  @Get('api/v1/jobs/:jobId')
  @HttpCode(200)
  getJob(@Param() path: GetJobInput['path']): Promise<GetJobResult> {
    return this.service.getJob({ path });
  }

  /** 请求合作式取消任务 */
  @Post('api/v1/jobs/:jobId/cancel')
  @HttpCode(202)
  cancelJob(
    @Param() path: CancelJobInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<CancelJobResult> {
    return this.service.cancelJob({ path, headers: { 'Idempotency-Key': idempotencyKey } });
  }

  /** 从失败或取消任务创建重试任务 */
  @Post('api/v1/jobs/:jobId/retry')
  @HttpCode(202)
  retryJob(
    @Param() path: RetryJobInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: RetryJobInput['body'],
  ): Promise<RetryJobResult> {
    return this.service.retryJob({ path, headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 获取处理步骤 */
  @Get('api/v1/jobs/:jobId/steps')
  @HttpCode(200)
  listJobSteps(
    @Param() path: ListJobStepsInput['path'],
    @Query() query: ListJobStepsInput['query'],
  ): Promise<ListJobStepsResult> {
    return this.service.listJobSteps({ path, query });
  }

  /** 分页回放任务事件 */
  @Get('api/v1/jobs/:jobId/events')
  @HttpCode(200)
  listJobEvents(
    @Param() path: ListJobEventsInput['path'],
    @Query() query: ListJobEventsInput['query'],
  ): Promise<ListJobEventsResult> {
    return this.service.listJobEvents({ path, query });
  }

  /** 订阅可恢复的任务事件 */
  @Get('api/v1/jobs/:jobId/events/stream')
  @HttpCode(200)
  streamJobEvents(
    @Param() path: StreamJobEventsInput['path'],
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Promise<StreamJobEventsResult> {
    return this.service.streamJobEvents({ path, headers: { 'Last-Event-ID': lastEventId } });
  }

  /** 查询任务模型调用用量 */
  @Get('api/v1/jobs/:jobId/invocations')
  @HttpCode(200)
  listJobInvocations(
    @Param() path: ListJobInvocationsInput['path'],
    @Query() query: ListJobInvocationsInput['query'],
  ): Promise<ListJobInvocationsResult> {
    return this.service.listJobInvocations({ path, query });
  }
}
