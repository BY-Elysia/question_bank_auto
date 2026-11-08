import { Controller, Get, Put, Param, Body, Inject, StreamableFile, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { KnowledgeService } from '../application/knowledge/knowledge-service.js';
import { ScopeInput } from '../domain/knowledge.js';
import { parse } from '../../../shared/errors.js';
export const KNOWLEDGE = Symbol('KNOWLEDGE');
@Controller('api/assistant')
export class KnowledgeController {
  constructor(@Inject(KNOWLEDGE) private knowledge: KnowledgeService) {}
  @Get('knowledge/workspaces') workspaces() {
    return this.knowledge.query.list(this.knowledge.principalId);
  }
  @Get('conversations/:id/scope') scope(@Param('id') id: string) {
    return this.knowledge.scope(id);
  }
  @Put('conversations/:id/scope') update(@Param('id') id: string, @Body() body: unknown) {
    const input = parse(ScopeInput, body);
    return this.knowledge.setScope(id, input.workspaceIds, input.focus, input.allowEdits);
  }
  @Get('conversations/:id/citations/:citation') citation(
    @Param('id') id: string,
    @Param('citation') citation: string,
  ) {
    return this.knowledge.citation(id, citation);
  }
  @Get('conversations/:id/citations/:citation/pages/:page/image') async image(
    @Param('id') id: string,
    @Param('citation') citation: string,
    @Param('page') page: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const asset = await this.knowledge.image(
      id,
      citation,
      parse(z.coerce.number().int().positive(), page),
    );
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(asset.body, { type: asset.contentType, length: asset.size });
  }
}
