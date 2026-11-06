import type { SettingsRepository } from '../ports/settings.repository.js';
import type { UsageRepository } from '../ports/usage.repository.js';
import type { ModelSettingsInput } from '../domain/settings.js';
import type { ModelSettings } from '../../../ai/ports/model-settings.js';
import type { ModelClient } from '../../../ai/ports/model-client.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import { fail } from '../../../shared/errors.js';
export class ProfileService {
  constructor(
    private settings: SettingsRepository,
    private usage: UsageRepository,
    private books: BookRepository,
    private client: (value: ModelSettings) => ModelClient,
  ) {}
  async get() {
    const { apiKey, ...value } = await this.settings.get();
    return { ...value, hasApiKey: Boolean(apiKey) };
  }
  private async resolve(input: ModelSettingsInput) {
    const previous = await this.settings.get();
    const sameOrigin =
      new URL(input.baseUrl).origin === (previous.baseUrl ? new URL(previous.baseUrl).origin : '');
    // Never forward an old secret to a newly entered provider.
    const apiKey = input.apiKey || (sameOrigin ? previous.apiKey : '');
    if (!apiKey) fail(400, '请输入新服务的 API Key');
    return { ...input, apiKey, visionModel: input.visionModel || input.model };
  }
  async save(input: ModelSettingsInput) {
    await this.settings.save(await this.resolve(input));
    return this.get();
  }
  async test(input: ModelSettingsInput) {
    const config = await this.resolve(input),
      start = Date.now();
    try {
      const result = await this.client(config).complete({
        system: 'Reply with OK.',
        input: 'Connection test',
        images: [],
        role: 'reasoning',
        cache: 'off',
        outputMode: 'text',
        maxOutputTokens: 128,
        signal: AbortSignal.timeout(30000),
      });
      return {
        ok: true,
        model: result.model,
        durationMs: Date.now() - start,
        reply: result.text.slice(0, 300),
      };
    } catch {
      return {
        ok: false,
        durationMs: Date.now() - start,
        message: '连接测试失败，请检查接口地址、协议、模型名称和密钥。',
      };
    }
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
