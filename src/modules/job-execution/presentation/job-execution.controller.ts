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
import { JOB_EXECUTION_SERVICE } from '../application/job-execution.service.interface.js';
import type { JobExecutionService } from '../application/job-execution.service.interface.js';
import type { ClaimJobInput, ClaimJobResult } from './dto/claim-job.dto.js';
import type { HeartbeatJobInput, HeartbeatJobResult } from './dto/heartbeat-job.dto.js';
import type {
  UploadJobArtifactInput,
  UploadJobArtifactResult,
} from './dto/upload-job-artifact.dto.js';
import type { CommitJobStepInput, CommitJobStepResult } from './dto/commit-job-step.dto.js';
import type { CompleteJobInput, CompleteJobResult } from './dto/complete-job.dto.js';
import type {
  ReadJobArtifactContentInput,
  ReadJobArtifactContentResult,
} from './dto/read-job-artifact-content.dto.js';

@Controller()
export class JobExecutionController {
  constructor(@Inject(JOB_EXECUTION_SERVICE) private readonly service: JobExecutionService) {}

  /** 领取分配给当前工作区的任务 */
  @Post('internal/v1/leases/claim')
  @HttpCode(200)
  claimJob(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: ClaimJobInput['body'],
  ): Promise<ClaimJobResult> {
    return this.service.claimJob({ headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 续约并读取取消状态 */
  @Post('internal/v1/jobs/:jobId/heartbeat')
  @HttpCode(200)
  heartbeatJob(
    @Param() path: HeartbeatJobInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: HeartbeatJobInput['body'],
  ): Promise<HeartbeatJobResult> {
    return this.service.heartbeatJob({
      path,
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    });
  }

  /** 上传任务产物并登记暂存引用 */
  @Post('internal/v1/jobs/:jobId/artifacts')
  @HttpCode(201)
  uploadJobArtifact(
    @Param() path: UploadJobArtifactInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: UploadJobArtifactInput['body'],
  ): Promise<UploadJobArtifactResult> {
    return this.service.uploadJobArtifact({
      path,
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    });
  }

  /** 原子提交步骤结果与恢复检查点 */
  @Post('internal/v1/jobs/:jobId/steps/commit')
  @HttpCode(200)
  commitJobStep(
    @Param() path: CommitJobStepInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CommitJobStepInput['body'],
  ): Promise<CommitJobStepResult> {
    return this.service.commitJobStep({
      path,
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    });
  }

  /** 提交任务终态及候选结果 */
  @Post('internal/v1/jobs/:jobId/complete')
  @HttpCode(200)
  completeJob(
    @Param() path: CompleteJobInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CompleteJobInput['body'],
  ): Promise<CompleteJobResult> {
    return this.service.completeJob({ path, headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 读取当前任务的暂存产物 */
  @Post('internal/v1/jobs/:jobId/artifacts/read')
  @HttpCode(200)
  readJobArtifactContent(
    @Param() path: ReadJobArtifactContentInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: ReadJobArtifactContentInput['body'],
  ): Promise<ReadJobArtifactContentResult> {
    return this.service.readJobArtifactContent({
      path,
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    });
  }
}
