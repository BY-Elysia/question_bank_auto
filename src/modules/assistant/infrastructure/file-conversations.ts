import fs from 'node:fs/promises';
import path from 'node:path';
import { Conversation } from '../domain/conversation.js';
import type { ConversationRepository } from '../ports/conversation.repository.js';
import { atomicJson } from '../../../shared/infrastructure/atomic-json.js';
import { fail } from '../../../shared/errors.js';
export class FileConversations implements ConversationRepository {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private root: string) {}
  private file(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail(400, 'Invalid conversation ID');
    return path.join(this.root, 'conversations', id + '.json');
  }
  async list() {
    let files: string[];
    try {
      files = await fs.readdir(path.join(this.root, 'conversations'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    return Promise.all(
      files.filter((f) => f.endsWith('.json')).map((f) => this.get(f.slice(0, -5))),
    );
  }
  async get(id: string) {
    try {
      return Conversation.parse(JSON.parse(await fs.readFile(this.file(id), 'utf8')));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') fail(404, 'Conversation not found');
      throw e;
    }
  }
  async create(value: Conversation) {
    await atomicJson(this.file(value.id), Conversation.parse(value), 0o600);
  }
  async update(id: string, change: (value: Conversation) => void) {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        const value = await this.get(id);
        change(value);
        value.updatedAt = new Date().toISOString();
        await this.create(value);
        return value;
      });
    this.locks.set(id, task);
    try {
      return await task;
    } finally {
      if (this.locks.get(id) === task) this.locks.delete(id);
    }
  }
}
