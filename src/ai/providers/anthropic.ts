import type { ModelSettings } from '../ports/model-settings.js';
import type { ModelRequest } from '../ports/model-client.js';
import { postModel } from './http-transport.js';
/** Anthropic Messages adapter. Workflow schema validation remains provider-independent. */
export async function anthropicComplete(
  config: ModelSettings,
  request: ModelRequest,
  model: string,
  budget: number,
) {
  const content: unknown[] = [{ type: 'text', text: JSON.stringify(request.input) }];
  for (const image of request.images) {
    const data = image.url.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s);
    content.push(
      { type: 'text', text: `Page ${image.page}` },
      {
        type: 'image',
        source: data
          ? { type: 'base64', media_type: data[1], data: data[2] }
          : { type: 'url', url: image.url },
      },
    );
  }
  const result = await postModel(
    `${config.baseUrl.replace(/\/$/, '')}/messages`,
    config.apiKey,
    {
      model,
      max_tokens: budget,
      system:
        request.system +
        (request.structuredOutput
          ? `\nReturn JSON matching: ${JSON.stringify(request.structuredOutput.schema)}`
          : ''),
      messages: request.messages ?? [{ role: 'user', content }],
    },
    request.signal,
    { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
  );
  return {
    text: (result.content ?? [])
      .filter((v: any) => v.type === 'text')
      .map((v: any) => v.text)
      .join('\n'),
    model,
    usage: result.usage ?? null,
    outputFormat: 'text' as const,
    completionStatus:
      result.stop_reason === 'end_turn' || result.stop_reason === 'stop_sequence'
        ? ('completed' as const)
        : ('incomplete' as const),
  };
}
