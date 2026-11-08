import { Controller, Get, Post, Inject, Param, Body } from '@nestjs/common';
import { z } from 'zod';
import { ChangeService } from '../application/change-service.js';
import { KnowledgeService } from '../../assistant/application/knowledge/knowledge-service.js';
import { KNOWLEDGE } from '../../assistant/presentation/knowledge.controller.js';
import { parse } from '../../../shared/errors.js';
export const CHANGES = Symbol('CHANGES');
@Controller('api/workspaces/:id/changes')
export class ChangesController {
  constructor(
    @Inject(CHANGES) private changes: ChangeService,
    @Inject(KNOWLEDGE) private knowledge: KnowledgeService,
  ) {}
  private authorize(id: string) {
    return this.knowledge.query.authorize(this.knowledge.principalId, [id]);
  }
  @Get() async list(@Param('id') id: string) {
    await this.authorize(id);
    return (await this.changes.list(id)).slice(-30);
  }
  @Post(':change/undo') async undo(
    @Param('id') id: string,
    @Param('change') change: string,
    @Body() body: unknown,
  ) {
    const { revision } = parse(z.object({ revision: z.number().int().nonnegative() }), body);
    await this.authorize(id);
    return this.changes.undo(id, change, revision);
  }
}
