import fs from 'node:fs/promises';
import path from 'node:path';
import type { PrefixCache, PrefixEntry } from '../ports/prefix-cache.js';
import { atomicJson } from '../../shared/infrastructure/atomic-json.js';
export class FilePrefixCache implements PrefixCache {
  constructor(private root: string) {}
  private file(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid cache key');
    return path.join(this.root, 'model-cache', `${key}.json`);
  }
  async get(key: string) {
    try {
      const entry = JSON.parse(await fs.readFile(this.file(key), 'utf8')) as PrefixEntry;
      if (typeof entry.responseId !== 'string' || !Number.isFinite(entry.expiresAt))
        throw new Error('Invalid prefix cache entry');
      return entry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async set(key: string, value: PrefixEntry) {
    await atomicJson(this.file(key), value);
  }
  async remove(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
}
