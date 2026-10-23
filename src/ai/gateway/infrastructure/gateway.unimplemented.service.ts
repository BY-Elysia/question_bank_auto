import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { GatewayService } from '../application/gateway.service.interface.js';
import type {
  InvokeModelInput,
  InvokeModelResult,
} from '../application/commands/invoke-model.command.js';
import type {
  ExecuteToolInput,
  ExecuteToolResult,
} from '../application/commands/execute-tool.command.js';

@Injectable()
export class GatewayUnimplementedService implements GatewayService {
  async invokeModel(_input: InvokeModelInput): Promise<InvokeModelResult> {
    throw new OperationNotImplemented('invokeModel');
  }

  async executeTool(_input: ExecuteToolInput): Promise<ExecuteToolResult> {
    throw new OperationNotImplemented('executeTool');
  }
}
