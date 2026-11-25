import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { z } from 'zod';
import { HttpModelClient } from '../dist/app/ai/providers/model-client.js';
import { providerSchema, stripNullOptionals } from '../dist/app/ai/providers/structured-format.js';
import { SkillRunner } from '../dist/app/ai/runtime/skill-runner.js';
import { extractionOutput } from '../dist/app/ai/workflows/textbook-extraction/output-contract.js';
import { ExtractResult } from '../dist/app/ai/workflows/textbook-extraction/contracts.js';
import { fixture, range, question } from './helpers.mjs';

test('Provider transports support Responses and Chat Completions with bounded transient retry', async (t) => {
  const names = [
    'MODEL_BASE_URL',
    'MODEL_API_KEY',
    'MODEL_NAME',
    'MODEL_PROTOCOL',
    'VISION_MODEL',
    'REASONING_MODEL',
  ];
  const prior = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  let count = 0,
    seen = [],
    incomplete = false;
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    seen.push({ url: req.url, body });
    count++;
    if (count === 1) {
      res.writeHead(429);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url.endsWith('/responses')
          ? {
              status: incomplete ? 'incomplete' : 'completed',
              output: [{ content: [{ text: '{"ok":true}' }] }],
              usage: { total_tokens: 3 },
            }
          : {
              choices: [
                {
                  finish_reason: incomplete ? 'length' : 'stop',
                  message: { content: '{"ok":true}' },
                },
              ],
            },
      ),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
    await new Promise((resolve) => server.close(resolve));
  });
  process.env.MODEL_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.MODEL_API_KEY = 'test-only';
  process.env.MODEL_NAME = 'test-model';
  process.env.VISION_MODEL = '';
  process.env.REASONING_MODEL = '';
  const client = new HttpModelClient();
  const input = {
    system: 'JSON',
    input: { a: 1 },
    images: [{ page: 1, url: 'data:image/png;base64,AA==' }],
    signal: new AbortController().signal,
    role: 'vision',
    maxOutputTokens: 2048,
  };
  process.env.MODEL_PROTOCOL = 'responses';
  assert.equal((await client.complete(input)).text, '{"ok":true}');
  assert.equal(count, 2);
  assert.ok(seen[1].body.input);
  assert.equal(seen[1].body.max_output_tokens, 2048);
  assert.deepEqual(seen[1].body.text, { format: { type: 'json_object' } });
  process.env.MODEL_PROTOCOL = 'chat';
  assert.equal((await client.complete(input)).text, '{"ok":true}');
  assert.ok(seen[2].body.messages);
  assert.equal(seen[2].body.max_tokens, 2048);
  process.env.MODEL_PROTOCOL = 'responses';
  await client.complete({
    ...input,
    cache: 'off',
    structuredOutput: {
      name: 'strict_retry',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string', minLength: 1 } },
        required: ['answer'],
        additionalProperties: false,
      },
    },
  });
  assert.equal(seen[3].body.text.format.type, 'json_schema');
  assert.equal(seen[3].body.text.format.strict, true);
  assert.equal(seen[3].body.previous_response_id, undefined);
  assert.equal(seen[3].body.thinking.type, 'disabled');
  await assert.rejects(
    client.complete({
      ...input,
      cache: 'prefix',
      structuredOutput: { name: 'invalid', schema: {} },
    }),
    /cache=off/,
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(client.complete({ ...input, signal: abort.signal }));
  assert.equal(count, 4);
  process.env.MODEL_PROTOCOL = 'responses';
  assert.equal((await client.complete({ ...input, outputMode: 'text' })).outputFormat, 'text');
  assert.equal(seen.at(-1).body.text.format.type, 'text');
  process.env.MODEL_PROTOCOL = 'chat';
  await client.complete({ ...input, outputMode: 'text' });
  assert.equal(seen.at(-1).body.response_format, undefined);
  process.env.MODEL_PROTOCOL = 'responses';
  incomplete = true;
  assert.equal((await client.complete(input)).completionStatus, 'incomplete');
  process.env.MODEL_PROTOCOL = 'chat';
  assert.equal((await client.complete(input)).completionStatus, 'incomplete');
});

test('Strict structuredOutput retry allows null for optional Zod fields and strips them before parsing', async (t) => {
  const schema = z.strictObject({
    requiredText: z.string(),
    optionalNote: z.string().min(4).optional(),
    nullableValue: z.string().nullable(),
    optionalNullableValue: z.string().nullable().optional(),
    nested: z
      .strictObject({
        title: z.string(),
        subtitle: z.string().optional(),
      })
      .optional(),
  });
  const jsonSchema = z.toJSONSchema(schema);
  const converted = providerSchema(jsonSchema);
  assert.deepEqual(converted.required, [
    'requiredText',
    'optionalNote',
    'nullableValue',
    'optionalNullableValue',
    'nested',
  ]);
  assert.deepEqual(converted.properties.optionalNote, {
    anyOf: [{ type: 'string' }, { type: 'null' }],
  });
  assert.deepEqual(converted.properties.nullableValue, { type: ['string', 'null'] });
  assert.deepEqual(converted.properties.optionalNullableValue, { type: ['string', 'null'] });
  assert.deepEqual(
    stripNullOptionals(
      {
        requiredText: 'ok',
        optionalNote: null,
        nullableValue: null,
        optionalNullableValue: null,
        nested: { title: 't', subtitle: null },
      },
      jsonSchema,
    ),
    {
      requiredText: 'ok',
      nullableValue: null,
      optionalNullableValue: null,
      nested: { title: 't' },
    },
  );

  const names = [
    'MODEL_BASE_URL',
    'MODEL_API_KEY',
    'MODEL_NAME',
    'MODEL_PROTOCOL',
    'VISION_MODEL',
    'REASONING_MODEL',
  ];
  const prior = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  let calls = 0;
  let strictSchema = null;
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.setHeader('Content-Type', 'application/json');
    if (body.caching?.prefix) {
      res.end(JSON.stringify({ id: 'seed-1' }));
      return;
    }
    calls++;
    if (calls === 1) {
      res.end(JSON.stringify({ status: 'completed', output_text: 'not-json' }));
      return;
    }
    strictSchema = body.text?.format?.schema;
    const q = question('1');
    q.grading = null;
    res.end(
      JSON.stringify({
        status: 'completed',
        output_text: JSON.stringify({ question: q, issues: [] }),
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const s = await fixture(t);
  t.after(async () => {
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
    await new Promise((resolve) => server.close(resolve));
  });
  process.env.MODEL_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.MODEL_API_KEY = 'test-only';
  process.env.MODEL_NAME = 'test-model';
  process.env.VISION_MODEL = '';
  process.env.REASONING_MODEL = '';
  process.env.MODEL_PROTOCOL = 'responses';

  const runner = new SkillRunner(
    s.store,
    new HttpModelClient(),
    {
      async dataUrl() {
        throw new Error('Unexpected image');
      },
    },
    {
      async get() {
        return {
          id: 'page-content-extract',
          version: '1',
          instructions: 'Extract',
          modelRole: 'vision',
        };
      },
    },
    { async pin() {}, async record() {} },
  );
  const result = await runner.run(
    'page-content-extract',
    {},
    ExtractResult,
    [],
    { bookId: 'book', jobId: 'strict-opt', cache: 'off', signal: new AbortController().signal },
    extractionOutput([range('q', [1])]),
  );
  assert.equal(calls, 2);
  assert.ok(
    strictSchema.properties.question.properties.grading.anyOf.some((b) => b.type === 'null'),
  );
  assert.equal(result.items[0].content.question.grading, undefined);
});
