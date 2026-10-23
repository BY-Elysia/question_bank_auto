import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ModelClient } from '../providers/model-client.js';
import type { PageImagePort } from '../../modules/textbooks/ports/workspace.repository.js';
import type { WorkspaceRepository } from '../../modules/textbooks/ports/workspace.repository.js';
export type SkillId =
  | 'textbook-structure-detect'
  | 'cross-page-reconcile'
  | 'page-content-extract'
  | 'source-verify'
  | 'content-repair'
  | 'answer-generate';
export interface SkillContext {
  bookId: string;
  jobId: string;
  signal: AbortSignal;
}
export interface Skills {
  run<T extends z.ZodType>(
    id: SkillId,
    input: unknown,
    schema: T,
    pages: number[],
    context: SkillContext,
  ): Promise<z.infer<T>>;
}
export class SkillRunner implements Skills {
  constructor(
    private store: WorkspaceRepository,
    private model: ModelClient,
    private images: PageImagePort,
  ) {}
  async run<T extends z.ZodType>(
    id: SkillId,
    input: unknown,
    schema: T,
    pages: number[],
    context: SkillContext,
  ): Promise<z.infer<T>> {
    const base = new URL(`../skills/${id}/`, import.meta.url);
    const definition = JSON.parse(await fs.readFile(new URL('definition.json', base), 'utf8'));
    const instructions = await fs.readFile(new URL('SKILL.md', base), 'utf8');
    if (definition.id !== id || !instructions.includes(`name: ${id}\n`))
      throw new Error('Invalid skill package');
    const hash = createHash('sha256').update(instructions).digest('hex');
    const pinFile = path.join(this.store.dir(context.bookId), 'runs', context.jobId, `${id}.json`);
    let pin;
    try {
      pin = JSON.parse(await fs.readFile(pinFile, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (pin && (pin.hash !== hash || pin.version !== definition.version))
      throw new Error('Skill instructions changed; start a new job to use a new version');
    if (!pin) await this.store.atomic(pinFile, { hash, version: definition.version });
    const book = await this.store.read(context.bookId);
    const images = await Promise.all(
      [...new Set(pages)].map(async (page) => {
        if (!book.pages.some((p) => p.number === page))
          throw new Error('Skill requested an unknown page');
        return {
          page,
          url: `data:image/png;base64,${(await fs.readFile(await this.images.ensure(book.id, page, context.signal))).toString('base64')}`,
        };
      }),
    );
    const system = `${instructions}\n只输出 JSON，不要代码围栏。输出 JSON Schema：\n${JSON.stringify(z.toJSONSchema(schema))}`;
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      context.signal.throwIfAborted();
      const result = await this.model.complete({
        system,
        input: { task: input, validationFeedback: feedback },
        images,
        signal: context.signal,
        role: definition.modelRole,
      });
      const invocationId = randomUUID();
      await this.store.atomic(
        path.join(this.store.dir(book.id), 'runs', context.jobId, `${invocationId}.json`),
        {
          id: invocationId,
          skill: id,
          version: definition.version,
          instructionHash: hash,
          model: result.model,
          usage: result.usage,
          at: new Date().toISOString(),
          attempt,
        },
      );
      try {
        const text = result.text
          .trim()
          .replace(/^```(?:json)?\s*/, '')
          .replace(/\s*```$/, '');
        return schema.parse(JSON.parse(text));
      } catch (error) {
        feedback = `上次输出未通过结构校验，请重新按原始资料输出：${error instanceof Error ? error.message : String(error)}`;
      }
    }
    throw new Error(`${id}: invalid structured output after two attempts`);
  }
}
