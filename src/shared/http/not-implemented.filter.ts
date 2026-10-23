import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { OperationNotImplemented } from '../errors/operation-not-implemented.js';
import type { Problem } from '../errors/problem.js';

@Catch(OperationNotImplemented)
export class NotImplementedFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(error: OperationNotImplemented, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const requestId = randomUUID();
    const problem: Problem = {
      type: 'urn:question-bank:problem:not-implemented',
      title: '接口尚未实现',
      status: 501,
      code: 'NOT_IMPLEMENTED',
      detail: error.message,
      requestId,
      retryable: false,
    };
    const adapter = this.adapterHost.httpAdapter;
    adapter.setHeader(response, 'Content-Type', 'application/problem+json');
    adapter.setHeader(response, 'X-Request-Id', requestId);
    adapter.reply(response, problem, 501);
  }
}
