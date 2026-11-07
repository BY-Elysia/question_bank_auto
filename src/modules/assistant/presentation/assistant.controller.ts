import { Controller, Get, Post, Body, Param, Inject, HttpCode } from '@nestjs/common';
import { HarnessService } from '../application/harness/service.js';
import { ChatInput } from '../domain/conversation.js';
import { parse } from '../../../shared/errors.js';
export const ASSISTANT = Symbol('ASSISTANT');
@Controller('api/assistant/conversations')
export class AssistantController {
  constructor(@Inject(ASSISTANT) private service: HarnessService) {}
  @Get() list() {
    return this.service.list();
  }
  @Post() create() {
    return this.service.create();
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.service.get(id);
  }
  @Post(':id/messages') @HttpCode(202) send(@Param('id') id: string, @Body() body: unknown) {
    return this.service.send(id, parse(ChatInput, body).text);
  }
}
