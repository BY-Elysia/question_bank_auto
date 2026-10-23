import { setTimeout as sleep } from 'node:timers/promises';
export interface ModelRequest {
  system: string;
  input: unknown;
  images: { page: number; url: string }[];
  signal: AbortSignal;
  role: 'vision' | 'reasoning';
}
export interface ModelClient {
  complete(request: ModelRequest): Promise<{ text: string; usage: unknown; model: string }>;
}
export class HttpModelClient implements ModelClient {
  async complete(request: ModelRequest) {
    const base = process.env.MODEL_BASE_URL || process.env.ARK_BASE_URL;
    const key = process.env.MODEL_API_KEY || process.env.ARK_API_KEY;
    const model =
      (request.role === 'vision' ? process.env.VISION_MODEL : process.env.REASONING_MODEL) ||
      process.env.MODEL_NAME ||
      process.env.ARK_MODEL;
    if (!base || !key || !model)
      throw new Error(
        'Configure MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME (or ARK equivalents)',
      );
    const protocol = process.env.MODEL_PROTOCOL || 'responses';
    if (!['responses', 'chat'].includes(protocol))
      throw new Error('MODEL_PROTOCOL must be responses or chat');
    const content: unknown[] = [];
    if (protocol === 'responses') {
      content.push({ type: 'input_text', text: JSON.stringify(request.input) });
      for (const image of request.images)
        content.push(
          { type: 'input_text', text: `PDF page ${image.page}` },
          { type: 'input_image', image_url: image.url },
        );
    } else {
      content.push({ type: 'text', text: JSON.stringify(request.input) });
      for (const image of request.images)
        content.push(
          { type: 'text', text: `PDF page ${image.page}` },
          { type: 'image_url', image_url: { url: image.url } },
        );
    }
    const body =
      protocol === 'responses'
        ? {
            model,
            input: [
              { role: 'system', content: [{ type: 'input_text', text: request.system }] },
              { role: 'user', content },
            ],
          }
        : {
            model,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content },
            ],
            response_format: { type: 'json_object' },
          };
    for (let attempt = 0; ; attempt++) {
      request.signal.throwIfAborted();
      try {
        const response = await fetch(
          `${base.replace(/\/$/, '')}/${protocol === 'responses' ? 'responses' : 'chat/completions'}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(Number(process.env.MODEL_TIMEOUT_MS ?? 180000)),
            ]),
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          if ((response.status === 429 || response.status >= 500) && attempt < 2) {
            await sleep(1000 * (attempt + 1), undefined, { signal: request.signal });
            continue;
          }
          throw new Error(`Model provider HTTP ${response.status}`);
        }
        const data = (await response.json()) as {
          output_text?: string;
          output?: { content?: { text?: string }[] }[];
          choices?: { message?: { content?: string } }[];
          usage?: unknown;
        };
        const text =
          protocol === 'responses'
            ? data.output_text ||
              (data.output ?? [])
                .flatMap((item) => item.content ?? [])
                .map((item) => item.text ?? '')
                .join('\n')
            : data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Model response contains no text');
        return { text, usage: data.usage ?? null, model };
      } catch (error) {
        if (request.signal.aborted) throw error;
        if (
          attempt < 2 &&
          (error instanceof TypeError || (error as Error).name === 'TimeoutError')
        ) {
          await sleep(1000 * (attempt + 1), undefined, { signal: request.signal });
          continue;
        }
        throw error;
      }
    }
  }
}
