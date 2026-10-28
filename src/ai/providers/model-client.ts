import { providerSchema } from './structured-format.js';
import type { ModelClient, ModelRequest } from '../ports/model-client.js';
import { MemoryPrefixCache, type PrefixCache } from '../ports/prefix-cache.js';
import { ArkPrefix } from './ark-prefix.js';
import { postModel } from './http-transport.js';
export class HttpModelClient implements ModelClient {
  private prefix: ArkPrefix;
  constructor(cache: PrefixCache = new MemoryPrefixCache()) {
    this.prefix = new ArkPrefix(cache);
  }
  async complete(request: ModelRequest) {
    const base = process.env.MODEL_BASE_URL || process.env.ARK_BASE_URL,
      key = process.env.MODEL_API_KEY || process.env.ARK_API_KEY;
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
    const format = request.structuredOutput
      ? {
          type: 'json_schema',
          name: request.structuredOutput.name,
          strict: true,
          schema: providerSchema(request.structuredOutput.schema),
        }
      : { type: 'json_object' };
    if (request.cache === 'prefix' && request.structuredOutput)
      throw new Error('Strict structured output requires cache=off; prefix calls use json_object');
    const content: unknown[] = [
      {
        type: protocol === 'responses' ? 'input_text' : 'text',
        text: JSON.stringify(request.input),
      },
    ];
    for (const image of request.images)
      content.push(
        { type: protocol === 'responses' ? 'input_text' : 'text', text: `Page ${image.page}` },
        protocol === 'responses'
          ? { type: 'input_image', image_url: image.url }
          : { type: 'image_url', image_url: { url: image.url } },
      );
    const url = `${base.replace(/\/$/, '')}/${protocol === 'responses' ? 'responses' : 'chat/completions'}`;
    let data: Record<string, any>, cache: unknown;
    if (request.cache === 'prefix') {
      if (protocol !== 'responses')
        throw new Error(
          'Explicit prefix caching requires an Ark-compatible Responses provider; select cache=off for other providers',
        );
      const completed = await this.prefix.complete(
        url,
        key,
        model,
        request.system,
        [{ role: 'user', content }],
        request.cacheScope ?? 'default',
        request.signal,
      );
      data = completed.result;
      cache = completed.cache;
    } else
      data = await postModel(
        url,
        key,
        protocol === 'responses'
          ? {
              model,
              text: { format },
              ...(request.structuredOutput ? { thinking: { type: 'disabled' } } : {}),
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
              response_format: request.structuredOutput
                ? {
                    type: 'json_schema',
                    json_schema: { name: format.name, strict: true, schema: format.schema },
                  }
                : { type: 'json_object' },
            },
        request.signal,
      );
    const text =
      protocol === 'responses'
        ? data.output_text ||
          (data.output ?? [])
            .flatMap((item: any) => item.content ?? [])
            .map((item: any) => item.text ?? '')
            .join('\n')
        : data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Model response contains no text');
    return {
      text,
      usage: data.usage ?? null,
      model,
      cache,
      outputFormat: request.structuredOutput ? ('json_schema' as const) : ('json_object' as const),
    };
  }
}
