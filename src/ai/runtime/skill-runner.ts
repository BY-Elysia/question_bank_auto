import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ModelClient } from '../ports/model-client.js';
import type { PageImagePort } from '../../modules/textbooks/ports/assets.port.js';
import type { BookRepository } from '../../modules/textbooks/ports/book.repository.js';
import type { SkillId, SkillCatalog, RunRecords } from '../ports/skill-catalog.js';
import type { Skills, SkillContext } from '../ports/skills.js';
export class SkillRunner implements Skills {
  constructor(
    private store: BookRepository,
    private model: ModelClient,
    private images: PageImagePort,
    private catalog: SkillCatalog,
    private records: RunRecords,
  ) {}
  async run<T extends z.ZodType>(
    id: SkillId,
    input: unknown,
    schema: T,
    pages: number[],
    context: SkillContext,
  ): Promise<z.infer<T>> {
    const definition = await this.catalog.get(id);
    const instructions = definition.instructions;
    const hash = createHash('sha256').update(instructions).digest('hex');
    await this.records.pin(context.bookId, context.jobId, id, {
      hash,
      version: definition.version,
    });
    const book = await this.store.read(context.bookId);
    const images = await Promise.all(
      [...new Set(pages)].map(async (page) => {
        if (!book.pages.some((p) => p.number === page))
          throw new Error('Skill requested an unknown page');
        return {
          page,
          url: await this.images.dataUrl(book.id, page, context.signal),
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
      await this.records.record(book.id, context.jobId, {
        id: invocationId,
        skill: id,
        version: definition.version,
        instructionHash: hash,
        model: result.model,
        usage: result.usage,
        at: new Date().toISOString(),
        attempt,
      });
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
