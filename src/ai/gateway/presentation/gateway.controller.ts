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
import { GATEWAY_SERVICE } from '../application/gateway.service.interface.js';
import type { GatewayService } from '../application/gateway.service.interface.js';
import type { InvokeModelInput, InvokeModelResult } from './dto/invoke-model.dto.js';
import type { ExecuteToolInput, ExecuteToolResult } from './dto/execute-tool.dto.js';

@Controller()
export class GatewayController {
  constructor(@Inject(GATEWAY_SERVICE) private readonly service: GatewayService) {}

  /** 通过冻结配置调用外部模型 */
  @Post('internal/v1/jobs/:jobId/model-invocations')
  @HttpCode(200)
  invokeModel(
    @Param() path: InvokeModelInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: InvokeModelInput['body'],
  ): Promise<InvokeModelResult> {
    return this.service.invokeModel({ path, headers: { 'Idempotency-Key': idempotencyKey }, body });
  }

  /** 执行当前 Skill 获授权的工具调用 */
  @Post('internal/v1/jobs/:jobId/tool-executions')
  @HttpCode(200)
  executeTool(
    @Param() path: ExecuteToolInput['path'],
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: ExecuteToolInput['body'],
  ): Promise<ExecuteToolResult> {
    return this.service.executeTool({ path, headers: { 'Idempotency-Key': idempotencyKey }, body });
  }
}
