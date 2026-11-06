import { KeyedLock } from '../../shared/concurrency/keyed-lock.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunRecords, SkillPin, InvocationRecord } from '../ports/skill-catalog.js';
import { atomicJson } from '../../shared/infrastructure/atomic-json.js';
export class FileRunRecords implements RunRecords {
  private locks = new KeyedLock();
  constructor(private root: string) {}
  private file(bookId: string, jobId: string, name: string) {
    if ([bookId, jobId, name].some((v) => !/^[a-zA-Z0-9_-]{1,100}$/.test(v)))
      throw new Error('Invalid run record identifier');
    return path.join(this.root, 'books', bookId, 'runs', jobId, `${name}.json`);
  }
  async pin(bookId: string, jobId: string, id: string, expected: SkillPin) {
    const file = this.file(bookId, jobId, id);
    await this.locks.run(file, async () => {
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
  }

  async record(bookId: string, jobId: string, record: InvocationRecord) {
    const file = this.file(bookId, jobId, record.id);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.chmod(path.dirname(file), 0o700);
    await atomicJson(file, record, 0o600);
  }
}
