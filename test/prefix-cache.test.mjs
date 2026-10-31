import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HttpModelClient } from '../dist/app/ai/providers/model-client.js';
import { FilePrefixCache } from '../dist/app/ai/infrastructure/file-prefix-cache.js';
import { setTimeout as delay } from 'node:timers/promises';
test('Explicit prefix cache shares only stable prompts, persists seeds, isolates scopes and refreshes expired references once', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prefix-test-'));
  const names = [
    'MODEL_BASE_URL',
    'MODEL_API_KEY',
    'MODEL_NAME',
    'MODEL_PROTOCOL',
    'VISION_MODEL',
    'REASONING_MODEL',
  ];
  const prior = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  const seen = [];
  let seeds = 0,
    expire = false,
    fail = false;
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    seen.push(body);
    res.setHeader('content-type', 'application/json');
    if (body.caching?.prefix) {
      await delay(15);
      res.end(JSON.stringify({ id: `seed_${++seeds}` }));
      return;
    }
    if (fail) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: { code: 'InvalidModel', message: 'sensitive value' } }));
      return;
    }
    if (expire) {
      expire = false;
      res.writeHead(404);
      res.end(JSON.stringify({ error: { code: 'ResponseNotFound' } }));
      return;
    }
    res.end(
      JSON.stringify({
        output_text: '{"ok":true}',
        usage: { input_tokens_details: { cached_tokens: 512 } },
      }),
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    for (const n of names) {
      if (prior[n] === undefined) delete process.env[n];
      else process.env[n] = prior[n];
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  Object.assign(process.env, {
    MODEL_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    MODEL_API_KEY: 'test-secret-do-not-persist',
    MODEL_NAME: 'test-model',
    MODEL_PROTOCOL: 'responses',
    VISION_MODEL: '',
    REASONING_MODEL: '',
  });
  const request = {
    system: 'Stable skill and schema',
    input: { page: 1 },
    images: [{ page: 1, url: 'data:image/png;base64,AA==' }],
    signal: new AbortController().signal,
    role: 'vision',
    cache: 'prefix',
    cacheScope: 'workspace_a',
    maxOutputTokens: 2048,
  };
  let client = new HttpModelClient(new FilePrefixCache(root));
  const responses = await Promise.all([
    client.complete(request),
    client.complete({ ...request, input: { page: 2 } }),
  ]);
  assert.equal(seeds, 1);
  assert.ok(responses.every((r) => r.cache.cachedTokens === 512));
  assert.deepEqual(
    seen[0].input.map((m) => m.role),
    ['system'],
  );
  assert.ok(!JSON.stringify(seen[0]).includes('base64'));
  assert.ok(
    seen
      .slice(1)
      .every(
        (r) =>
          r.previous_response_id === 'seed_1' &&
          r.input[0].role === 'user' &&
          r.store === true &&
          r.max_output_tokens === 2048 &&
          r.text?.format?.type === 'json_object',
      ),
  );
  client = new HttpModelClient(new FilePrefixCache(root));
  await client.complete(request);
  assert.equal(seeds, 1);
  await client.complete({ ...request, cacheScope: 'workspace_b' });
  assert.equal(seeds, 2);
  await client.complete({ ...request, system: 'Changed skill' });
  assert.equal(seeds, 3);
  expire = true;
  const refreshed = await client.complete(request);
  assert.equal(refreshed.cache.seedSource, 'refreshed');
  assert.equal(seeds, 4);
  fail = true;
  await assert.rejects(
    client.complete(request),
    (error) => error.message === 'Model provider HTTP 400',
  );
  assert.equal(seeds, 4);
  for (const file of await fs.readdir(path.join(root, 'model-cache')))
    assert.ok(
      !(await fs.readFile(path.join(root, 'model-cache', file), 'utf8')).includes(
        process.env.MODEL_API_KEY,
      ),
    );
  process.env.MODEL_PROTOCOL = 'chat';
  await assert.rejects(client.complete(request), /prefix caching requires/);
});
