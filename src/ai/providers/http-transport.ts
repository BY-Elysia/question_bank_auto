import { setTimeout as sleep } from 'node:timers/promises';
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly code = '',
    readonly param = '',
  ) {
    super(`Model provider HTTP ${status}`);
  }
}
export async function postModel(
  url: string,
  key: string,
  body: unknown,
  signal: AbortSignal,
): Promise<Record<string, any>> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(Number(process.env.MODEL_TIMEOUT_MS ?? 180000)),
        ]),
      });
      if (!response.ok) {
        let code = '',
          param = '';
        try {
          const data = (await response.json()) as { error?: { code?: string; param?: string } };
          code = data.error?.code ?? '';
          param = data.error?.param ?? '';
        } catch {}
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await sleep(1000 * (attempt + 1), undefined, { signal });
          continue;
        }
        throw new ProviderError(response.status, code, param);
      }
      return await response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      if (attempt < 2 && (error instanceof TypeError || (error as Error).name === 'TimeoutError')) {
        await sleep(1000 * (attempt + 1), undefined, { signal });
        continue;
      }
      throw error;
    }
  }
}
