import { createHash } from 'node:crypto';
import type { PrefixCache } from '../ports/prefix-cache.js';
import { postModel, ProviderError } from './http-transport.js';
interface PendingSeed {
  promise: Promise<{ id: string; usage: unknown }>;
  controller: AbortController;
  waiters: Set<object>;
}

function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export class ArkPrefix {
  private pending = new Map<string, PendingSeed>();
  constructor(private cache: PrefixCache) {}
  async complete(
    url: string,
    apiKey: string,
    model: string,
    system: string,
    input: unknown[],
    scope: string,
    signal: AbortSignal,
    maxOutputTokens: number,
    outputMode: 'text' | 'json_object',
    role: 'vision' | 'reasoning' = 'vision',
  ) {
    const thinking = role === 'reasoning' ? {} : { thinking: { type: 'disabled' } };
    const key = createHash('sha256')
      .update(JSON.stringify([url, apiKey, model, scope, role, system]))
      .digest('hex');
    const seedUsage: unknown[] = [];
    const seed = async () => {
      const existing = await this.cache.get(key);
      if (existing && existing.expiresAt > Date.now() + 30000)
        return { id: existing.responseId, source: 'reused' };
      signal.throwIfAborted();
      let entry = this.pending.get(key);
      const ownsSeed = !entry;
      if (!entry) {
        const controller = new AbortController();
        const waiters = new Set<object>();
        const promise = (async () => {
          const expiresAt = Math.floor(Date.now() / 1000) + 3600;
          const result = await postModel(
            url,
            apiKey,
            {
              model,
              input: [{ role: 'system', content: [{ type: 'input_text', text: system }] }],
              store: true,
              caching: { type: 'enabled', prefix: true },
              ...thinking,
              expire_at: expiresAt,
            },
            controller.signal,
          );
          if (typeof result.id !== 'string' || !result.id)
            throw new Error('Prefix seed response contains no ID');
          await this.cache.set(key, { responseId: result.id, expiresAt: expiresAt * 1000 });
          return { id: result.id, usage: result.usage ?? null };
        })().finally(() => this.pending.delete(key));
        entry = { promise, controller, waiters };
        this.pending.set(key, entry);
      }
      const waiter = {};
      entry.waiters.add(waiter);
      const onAbort = () => {
        entry!.waiters.delete(waiter);
        if (!entry!.waiters.size) entry!.controller.abort(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      let result;
      try {
        result = await raceSignal(entry.promise, signal);
      } finally {
        signal.removeEventListener('abort', onAbort);
        entry.waiters.delete(waiter);
      }
      if (ownsSeed) seedUsage.push(result.usage);
      return { id: result.id, source: ownsSeed ? 'created' : 'reused' };
    };
    let prefix = await seed();
    const invoke = (id: string) =>
      postModel(
        url,
        apiKey,
        {
          model,
          previous_response_id: id,
          max_output_tokens: maxOutputTokens,
          text: { format: { type: outputMode } },
          input,
          caching: { type: 'enabled' },
          ...thinking,
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
          ) ||
          /previous_response_id|Response.*(expired|not found|invalid)|(expired|not found|invalid).*response/i.test(
            error.detail,
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
        seedUsage,
        seedSource: prefix.source,
        cachedTokens: result.usage?.input_tokens_details?.cached_tokens ?? 0,
      },
    };
  }
}
