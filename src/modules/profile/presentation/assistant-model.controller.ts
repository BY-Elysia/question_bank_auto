import { Controller, Get, Put, Post, Body, Inject } from '@nestjs/common';
import { ModelConfiguration } from '../application/model-configuration.js';
import { ModelSettingsInput } from '../domain/settings.js';
import { parse } from '../../../shared/errors.js';
export const ASSISTANT_MODEL = Symbol('ASSISTANT_MODEL');
@Controller('api/assistant/model')
export class AssistantModelController {
  constructor(@Inject(ASSISTANT_MODEL) private service: ModelConfiguration) {}
  @Get() get() {
    return this.service.get();
  }
  @Put() save(@Body() body: unknown) {
    return this.service.save(parse(ModelSettingsInput, body));
  }
  @Post('test') test(@Body() body: unknown) {
    return this.service.test(parse(ModelSettingsInput, body));
  }
}
