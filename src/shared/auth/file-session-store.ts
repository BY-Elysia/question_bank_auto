import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SessionStore } from './session-store.js';

const StoredSessions = z.strictObject({
  version: z.literal(1),
  credentials: z.string().regex(/^[a-f0-9]{64}$/),
  sessions: z
    .array(z.tuple([z.string().regex(/^[a-f0-9]{64}$/), z.number().int().positive()]))
    .max(100),
});

/** Single-process adapter, on the persistent workspace volume (outside books/exports). */
export class FileSessionStore implements SessionStore {
  private sessions = new Map<string, number>();
  private pending: Promise<void> = Promise.resolve();
  private constructor(
    private file: string,
    private credentials: string,
  ) {}

  static async open(file: string, username: string, passwordHash: string) {
    const credentials = createHash('sha256')
      .update(JSON.stringify([username, passwordHash]))
      .digest('hex');
    const store = new FileSessionStore(file, credentials);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.chmod(path.dirname(file), 0o700);
    let raw: string;
    try {
      if ((await fs.stat(file)).size > 32768) throw new Error('Invalid session storage');
      raw = await fs.readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return store;
      throw error;
    }
    const parsed = StoredSessions.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error('Invalid session storage');
    if (parsed.data.credentials === credentials)
      store.sessions = new Map(parsed.data.sessions.filter(([, expiry]) => expiry > Date.now()));
    // Credential changes revoke all previous sessions, including across deployments.
    await store.persist(store.sessions);
    return store;
  }

  async has(digest: string, now: number) {
    return (this.sessions.get(digest) ?? 0) > now;
  }

  replace(previous: string, digest: string, expiresAt: number, now: number) {
    return this.mutate((next) => {
      for (const [key, expiry] of next) if (expiry <= now) next.delete(key);
      next.delete(previous);
      while (next.size >= 100) next.delete(next.keys().next().value!);
      next.set(digest, expiresAt);
    });
  }

  revoke(digest: string) {
    return this.mutate((next) => {
      next.delete(digest);
    });
  }

  private mutate(change: (next: Map<string, number>) => void) {
    const run = this.pending.then(async () => {
      const next = new Map(this.sessions);
      change(next);
      if (
        next.size === this.sessions.size &&
        [...next].every(([key, expiry]) => this.sessions.get(key) === expiry)
      )
        return;
      await this.persist(next);
      // Publish only after persistence succeeds; failed login/logout cannot
      // claim success while leaving different session state on disk.
      this.sessions = next;
    });
    this.pending = run.catch(() => {});
    return run;
  }

  private async persist(sessions: Map<string, number>) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ version: 1, credentials: this.credentials, sessions: [...sessions] }),
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, this.file);
      const directory = await fs.open(path.dirname(this.file), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
}
