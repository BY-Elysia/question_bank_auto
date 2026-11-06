import fs from 'node:fs/promises';
import path from 'node:path';
import type { UsageRepository, UsageTotal } from '../ports/usage.repository.js';
export function normalizeUsage(value: any) {
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const anthropic =
    value?.cache_read_input_tokens !== undefined ||
    value?.cache_creation_input_tokens !== undefined;
  const cached = count(
    value?.input_tokens_details?.cached_tokens ??
      value?.prompt_tokens_details?.cached_tokens ??
      value?.cache_read_input_tokens,
  );
  const input =
    count(value?.input_tokens ?? value?.prompt_tokens) +
    (anthropic ? cached + count(value?.cache_creation_input_tokens) : 0);
  const output = count(value?.output_tokens ?? value?.completion_tokens);
  return { input, output, cached, total: count(value?.total_tokens) || input + output };
}
export class FileUsage implements UsageRepository {
  private cache = new Map<string, { at: number; value: UsageTotal }>();
  constructor(private root: string) {}
  async summarize(ids: string[]) {
    const key = [...ids].sort().join(',');
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 5000) return cached.value;
    const value: UsageTotal = { input: 0, output: 0, cached: 0, total: 0, calls: 0, unreported: 0 };
    for (const id of ids) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid usage scope');
      const directory = path.join(this.root, 'books', id, 'runs');
      let jobs: string[];
      try {
        jobs = await fs.readdir(directory);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw e;
      }
      for (const job of jobs) {
        for (const file of await fs.readdir(path.join(directory, job))) {
          if (!file.endsWith('.json')) continue;
          const record = JSON.parse(await fs.readFile(path.join(directory, job, file), 'utf8'));
          if (!record.id || !('usage' in record)) continue;
          value.calls++;
          if (!record.usage) value.unreported++;
          for (const raw of [record.usage, ...(record.cache?.seedUsage ?? [])]) {
            const usage = normalizeUsage(raw);
            for (const k of ['input', 'output', 'cached', 'total'] as const) value[k] += usage[k];
          }
        }
      }
    }
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}
