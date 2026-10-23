import { Injectable } from '@nestjs/common';
import { OperationNotImplemented } from '../../../shared/errors/operation-not-implemented.js';
import type { IdentityService } from '../application/identity.service.interface.js';
import type { GetMeInput, GetMeResult } from '../application/commands/get-me.command.js';

@Injectable()
export class IdentityUnimplementedService implements IdentityService {
  async getMe(_input: GetMeInput): Promise<GetMeResult> {
    throw new OperationNotImplemented('getMe');
  }
}
