import { invocationTrace } from './invocation-trace.js';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ModelClient } from '../ports/model-client.js';
import type { PageImagePort } from '../../modules/textbooks/ports/assets.port.js';
import type { BookRepository } from '../../modules/textbooks/ports/book.repository.js';
import type { SkillId, SkillCatalog, RunRecords } from '../ports/skill-catalog.js';
import { StructuredOutputError, type Skills, type SkillContext } from '../ports/skills.js';
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
    const budget = Number(process.env.MAX_SKILL_DURATION_MS ?? 180000);
    if (!Number.isFinite(budget) || budget < 1) throw new Error('Invalid skill duration budget');
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(budget)]);
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
          url: await this.images.dataUrl(book.id, page, signal),
        };
      }),
    );
    const system = `${instructions}\n只输出 JSON，不要代码围栏。输出 JSON Schema：\n${JSON.stringify(z.toJSONSchema(schema))}`;
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      const invocationId = randomUUID();
      const startedAt = Date.now();
      const requestInput = {
        task: input,
        context: book.extractionContext,
        validationFeedback: feedback,
      };
      let result;
      try {
        result = await this.model.complete({
          system,
          cache:
            attempt > 0
              ? 'off'
              : (book.jobs.find((j) => j.id === context.jobId)?.request.cache ?? 'prefix'),
          ...(attempt > 0
            ? {
                structuredOutput: { name: id.replaceAll('-', '_'), schema: z.toJSONSchema(schema) },
              }
            : {}),
          cacheScope: book.workspaceId ?? book.id,
          input: requestInput,
          images,
          signal,
          role: definition.modelRole,
        });
      } catch (error) {
        await this.records.record(book.id, context.jobId, {
          id: invocationId,
          skill: id,
          version: definition.version,
          instructionHash: hash,
          model: 'unavailable',
          usage: null,
          at: new Date().toISOString(),
          attempt,
          durationMs: Date.now() - startedAt,
          // Transport error messages may contain headers or provider bodies; do not persist them.
          providerError: context.signal.aborted
            ? 'aborted'
            : signal.aborted
              ? 'deadline_exceeded'
              : 'provider_request_failed',
          ...invocationTrace(system, requestInput, pages, null),
        });
        throw error;
      }
      let parsed: z.infer<T> | undefined;
      let validationError: string | null = null;
      try {
        const text = result.text
          .trim()
          .replace(/^```(?:json)?\s*/, '')
          .replace(/\s*```$/, '');
        parsed = schema.parse(JSON.parse(text));
      } catch (error) {
        // Keep summary diagnostics safe; raw source output is available only in opt-in local traces.
        validationError =
          error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join('.')}: ${i.code}`)
                .join('; ')
                .slice(0, 2000)
            : 'Invalid JSON syntax';
        feedback = `上次输出未通过结构校验，请重新按原始资料输出：${error instanceof Error ? error.message : String(error)}`;
      }
      await this.records.record(book.id, context.jobId, {
        id: invocationId,
        skill: id,
        version: definition.version,
        instructionHash: hash,
        model: result.model,
        usage: result.usage,
        cache:
          result.cache ?? (attempt > 0 ? { mode: 'off', reason: 'structured_output_retry' } : null),
        at: new Date().toISOString(),
        attempt,
        validationError,
        outputFormat: result.outputFormat,
        durationMs: Date.now() - startedAt,
        ...invocationTrace(system, requestInput, pages, result.text),
      });
      if (validationError === null) return parsed!;
    }
    throw new StructuredOutputError(`${id}: invalid structured output after two attempts`);
  }
}
