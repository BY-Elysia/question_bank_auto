import { createHash } from 'node:crypto';
import type { PrefixCache } from '../ports/prefix-cache.js';
import { postModel, ProviderError } from './http-transport.js';
export class ArkPrefix {
  private pending = new Map<string, Promise<string>>();
  constructor(private cache: PrefixCache) {}
  async complete(
    url: string,
    apiKey: string,
    model: string,
    system: string,
    input: unknown[],
    scope: string,
    signal: AbortSignal,
  ) {
    const key = createHash('sha256')
      .update(JSON.stringify([url, apiKey, model, scope, system]))
      .digest('hex');
    const seed = async () => {
      const existing = await this.cache.get(key);
      if (existing && existing.expiresAt > Date.now() + 30000)
        return { id: existing.responseId, source: 'reused' };
      let pending = this.pending.get(key);
      if (!pending) {
        pending = (async () => {
          const expiresAt = Math.floor(Date.now() / 1000) + 3600;
          const result = await postModel(
            url,
            apiKey,
            {
              model,
              input: [{ role: 'system', content: [{ type: 'input_text', text: system }] }],
              store: true,
              caching: { type: 'enabled', prefix: true },
              thinking: { type: 'disabled' },
              expire_at: expiresAt,
            },
            signal,
          );
          if (typeof result.id !== 'string' || !result.id)
            throw new Error('Prefix seed response contains no ID');
          await this.cache.set(key, { responseId: result.id, expiresAt: expiresAt * 1000 });
          return result.id;
        })().finally(() => this.pending.delete(key));
        this.pending.set(key, pending);
      }
      return { id: await pending, source: 'created' };
    };
    let prefix = await seed();
    const invoke = (id: string) =>
      postModel(
        url,
        apiKey,
        {
          model,
          previous_response_id: id,
          input,
          caching: { type: 'enabled' },
          thinking: { type: 'disabled' },
          store: true,
          expire_at: Math.floor(Date.now() / 1000) + 3600,
        },
        signal,
      );
    let result;
    try {
      result = await invoke(prefix.id);
    } catch (error) {
      if (
        !(error instanceof ProviderError) ||
        !(
          error.status === 404 ||
          error.param === 'previous_response_id' ||
          /Response.*(Expired|NotFound|Invalid)|(Expired|NotFound|Invalid).*Response/i.test(
            error.code,
          )
        )
      )
        throw error;
      // Another request may already have replaced this expired seed.
      if ((await this.cache.get(key))?.responseId === prefix.id) await this.cache.remove(key);
      prefix = await seed();
      prefix.source = 'refreshed';
      result = await invoke(prefix.id);
    }
    return {
      result,
      cache: {
        mode: 'prefix',
        seedSource: prefix.source,
        cachedTokens: result.usage?.input_tokens_details?.cached_tokens ?? 0,
      },
    };
  }
}
