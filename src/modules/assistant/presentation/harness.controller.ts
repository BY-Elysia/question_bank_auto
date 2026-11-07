import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Inject,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { HarnessService } from '../application/harness/service.js';
import { StartRun, InputCommand, InteractionAnswer } from '../domain/run.js';
import { parse } from '../../../shared/errors.js';
import { ASSISTANT } from './assistant.controller.js';
@Controller('api/assistant')
export class HarnessController {
  constructor(@Inject(ASSISTANT) private service: HarnessService) {}
  @Get('conversations/:id/state') state(@Param('id') id: string) {
    return this.service.view(id);
  }
  @Patch('conversations/:id') rename(@Param('id') id: string, @Body() body: unknown) {
    return this.service.rename(
      id,
      parse(z.object({ title: z.string().trim().min(1).max(100) }), body).title,
    );
  }
  @Delete('conversations/:id') @HttpCode(204) remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
  @Get('conversations/:id/messages') messages(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.messages(
      id,
      cursor,
      parse(z.coerce.number().int().min(1).max(100).default(50), limit),
    );
  }
  @Post('conversations/:id/runs') @HttpCode(202) start(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const v = parse(StartRun, body);
    return this.service.start(id, v.text, v.requestId);
  }
  @Get('runs/:id') run(@Param('id') id: string) {
    return this.service.run(id);
  }
  @Post('runs/:id/inputs') @HttpCode(202) input(@Param('id') id: string, @Body() body: unknown) {
    const v = parse(InputCommand, body);
    return this.service.input(id, v.text, v.requestId, v.mode);
  }
  @Post('runs/:id/cancel') cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
  @Post('runs/:id/resume') @HttpCode(202) resume(@Param('id') id: string) {
    return this.service.resume(id);
  }
  @Post('runs/:id/retry') @HttpCode(202) retry(@Param('id') id: string) {
    return this.service.retry(id);
  }
  @Post('runs/:id/interactions/:interactionId/responses') @HttpCode(202) answer(
    @Param('id') id: string,
    @Param('interactionId') interaction: string,
    @Body() body: unknown,
  ) {
    return this.service.answer(id, interaction, parse(InteractionAnswer, body).answer);
  }
  @Get('runs/:id/events') events(
    @Param('id') id: string,
    @Query('after') after: string | undefined,
    @Res() res: Response,
  ) {
    let cursor = parse(
      z.coerce.number().int().nonnegative().default(0),
      after ?? res.req.get('Last-Event-ID'),
    );
    this.service.run(id);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    let closed = false;
    const pump = () => {
      if (closed || res.writableNeedDrain) return;
      try {
        const events = this.service.events(id, cursor);
        for (const e of events) {
          const writable = res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
          cursor = e.seq;
          if (!writable) break;
        }
        if (!events.length) res.write(': heartbeat\n\n');
      } catch {
        res.end();
      }
    };
    const timer = setInterval(pump, 250);
    res.on('close', () => {
      closed = true;
      clearInterval(timer);
    });
    pump();
  }
}
