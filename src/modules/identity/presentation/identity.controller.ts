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
import { IDENTITY_SERVICE } from '../application/identity.service.interface.js';
import type { IdentityService } from '../application/identity.service.interface.js';
import type { GetMeInput, GetMeResult } from './dto/get-me.dto.js';

@Controller()
export class IdentityController {
  constructor(@Inject(IDENTITY_SERVICE) private readonly service: IdentityService) {}

  /** 获取当前用户 */
  @Get('api/v1/me')
  @HttpCode(200)
  getMe(): Promise<GetMeResult> {
    return this.service.getMe({});
  }
}
