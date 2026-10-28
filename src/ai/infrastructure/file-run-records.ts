import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunRecords, SkillPin, InvocationRecord } from '../ports/skill-catalog.js';
import { atomicJson } from '../../shared/infrastructure/atomic-json.js';
export class FileRunRecords implements RunRecords {
  private locks = new Map<string, Promise<void>>();
  constructor(private root: string) {}
  private file(bookId: string, jobId: string, name: string) {
    if ([bookId, jobId, name].some((v) => !/^[a-zA-Z0-9_-]{1,100}$/.test(v)))
      throw new Error('Invalid run record identifier');
    return path.join(this.root, 'books', bookId, 'runs', jobId, `${name}.json`);
  }
  async pin(bookId: string, jobId: string, id: string, expected: SkillPin) {
    const file = this.file(bookId, jobId, id),
      prior = this.locks.get(file) ?? Promise.resolve();
    const next = prior
      .catch(() => {})
      .then(async () => {
        let pin: SkillPin | undefined;
        try {
          pin = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        if (pin && (pin.hash !== expected.hash || pin.version !== expected.version))
          throw new Error('Skill instructions changed; start a new job to use a new version');
        if (!pin) await atomicJson(file, expected);
      });
    this.locks.set(file, next);
    try {
      await next;
    } finally {
      if (this.locks.get(file) === next) this.locks.delete(file);
    }
  }
  async record(bookId: string, jobId: string, record: InvocationRecord) {
    await atomicJson(this.file(bookId, jobId, record.id), record, 0o600);
  }
}
