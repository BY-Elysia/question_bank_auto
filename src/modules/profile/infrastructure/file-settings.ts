import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJson } from '../../../shared/infrastructure/atomic-json.js';
import { environmentModelSettings, type ModelSettings } from '../../../ai/ports/model-settings.js';
import type { SettingsRepository } from '../ports/settings.repository.js';
export class FileSettings implements SettingsRepository {
  private file: string;
  constructor(root: string) {
    this.file = path.join(root, 'profile', 'model.json');
  }
  async get(): Promise<ModelSettings> {
    try {
      return JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return environmentModelSettings();
    }
  }
  async save(value: ModelSettings) {
    await atomicJson(this.file, value, 0o600);
  }
}
