import { Controller, Get, Put, Post, Body, Inject } from '@nestjs/common';
import { ProfileService } from '../application/profile.service.js';
import { ModelSettingsInput } from '../domain/settings.js';
import { parse } from '../../../shared/errors.js';
export const PROFILE = Symbol('PROFILE');
@Controller('api/profile')
export class ProfileController {
  constructor(@Inject(PROFILE) private service: ProfileService) {}
  @Get('model') get() {
    return this.service.get();
  }
  @Put('model') save(@Body() body: unknown) {
    return this.service.save(parse(ModelSettingsInput, body));
  }
  @Post('model/test') test(@Body() body: unknown) {
    return this.service.test(parse(ModelSettingsInput, body));
  }
  @Get('usage') usage() {
    return this.service.usageSummary();
  }
}
