import type { SettingsRepository } from '../ports/settings.repository.js';
import type { UsageRepository } from '../ports/usage.repository.js';
import type { ModelSettingsInput } from '../domain/settings.js';
import type { ModelSettings } from '../../../ai/ports/model-settings.js';
import type { ModelClient } from '../../../ai/ports/model-client.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import { ModelConfiguration } from './model-configuration.js';
export class ProfileService {
  private configuration: ModelConfiguration;
  constructor(
    settings: SettingsRepository,
    private usage: UsageRepository,
    private books: BookRepository,
    client: (value: ModelSettings) => ModelClient,
  ) {
    this.configuration = new ModelConfiguration(settings, client);
  }
  get() {
    return this.configuration.get();
  }
  save(input: ModelSettingsInput) {
    return this.configuration.save(input);
  }
  test(input: ModelSettingsInput) {
    return this.configuration.test(input);
  }
  async usageSummary() {
    const books = await this.books.list();
    const roots = books.filter((b) => !b.workspaceId || b.workspaceId === b.id);
    return {
      workspaces: await Promise.all(
        roots.map(async (b) => ({
          id: b.id,
          title: b.title,
          ...(await this.usage.summarize(
            books.filter((x) => x.id === b.id || x.workspaceId === b.id).map((x) => x.id),
          )),
        })),
      ),
      assistant: await this.usage.summarize(['assistant']),
    };
  }
}
