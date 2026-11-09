import { InteractionTools } from '../dist/app/modules/assistant/application/tools/interaction-tools.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PiRuntime } from '../dist/app/modules/assistant/infrastructure/runtime/pi-runtime.js';
async function provider(t, respond, tools=new InteractionTools()) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const data = JSON.parse(body);
    requests.push(data);
    res.setHeader('Content-Type', 'text/event-stream');
    respond(data, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  const runtime = new PiRuntime(
    {
      get: async () => ({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        apiKey: 'test',
        model: 'test',
        protocol: 'chat',
      }),
    },
    tools,
  );
  return { runtime, requests };
}
const chunk = (res, delta, finish = null) =>
  res.write(
    'data: ' +
      JSON.stringify({ id: 'reply', choices: [{ index: 0, delta, finish_reason: finish }] }) +
      '\n\n',
  );
const done = (res) => res.end('data: [DONE]\n\n');
const input = (runtime, text) => ({
  system: 'Ask if needed.',
  checkpoint: runtime.history([{ role: 'user', content: text }]),
  inputs: [],
  answers: [],
  signal: AbortSignal.timeout(5000),
  delta: () => {},
});

test('Pi adapter streams text and persists a tool question; user response reaches the tool result', async (t) => {
  const { runtime, requests } = await provider(t, (body, res) => {
    if (body.messages.some((x) => x.role === 'tool')) {
      chunk(res, { content: '继续完成' });
      chunk(res, {}, 'stop');
      done(res);
      return;
    }
    chunk(res, { content: '需要确认。' });
    chunk(res, {
      tool_calls: [
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: {
            name: 'request_user_input',
            arguments: '{"question":"选什么？","options":["A","B"],"kind":"confirmation"}',
          },
        },
      ],
    });
    chunk(res, {}, 'tool_calls');
    done(res);
  });
  let text = '';
  const a = await runtime.step({ ...input(runtime, 'start'), delta: (x) => (text += x) });
  assert.equal(text, '需要确认。');
  assert.equal(a.interactions.length, 1);
  assert.equal(a.stop, 'continue');
  const b = await runtime.step({
    ...input(runtime, ''),
    checkpoint: a.checkpoint,
    answers: [{ ...a.interactions[0], status: 'answered', answer: 'A' }],
  });
  assert.equal(b.text, '继续完成');
  assert.equal(b.stop, 'complete');
  assert.match(requests[1].messages.find((x) => x.role === 'tool').content, /"answer":"A"/);
  assert.ok(requests[0].stream);
  assert.equal(requests[0].tools[0].function.name, 'request_user_input');
});

test('Length-limited replies are failures and can resume without an invalid assistant tail', async (t) => {
  let n = 0;
  const { runtime } = await provider(t, (body, res) => {
    chunk(res, { content: ++n === 1 ? 'partial' : 'complete' });
    chunk(res, {}, n === 1 ? 'length' : 'stop');
    done(res);
  });
  const a = await runtime.step(input(runtime, 'hello'));
  assert.equal(a.stop, 'error');
  const b = await runtime.step({ ...input(runtime, ''), checkpoint: a.checkpoint });
  assert.equal(b.text, 'complete');
});

test('Abort cancels the actual provider stream and retains partial text', async (t) => {
  const { runtime } = await provider(t, (_, res) => {
    chunk(res, { content: 'partial' });
  });
  const abort = new AbortController();
  const a = await runtime.step({
    ...input(runtime, 'slow'),
    signal: abort.signal,
    delta: () => abort.abort(),
  });
  assert.equal(a.stop, 'aborted');
  assert.equal(a.text, 'partial');
});

test('Anthropic streaming uses the configured v1 path once, with isolated API key headers', async (t) => {
  let seen;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    seen = { path: req.url, key: req.headers['x-api-key'], body: JSON.parse(body) };
    res.setHeader('Content-Type', 'text/event-stream');
    const event = (type, value) =>
      res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    event('message_start', {
      message: {
        id: 'm',
        role: 'assistant',
        content: [],
        model: 'test',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 0 },
      },
    });
    event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'hello' } });
    event('content_block_stop', { index: 0 });
    event('message_delta', {
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    });
    event('message_stop', {});
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  const runtime = new PiRuntime(
    {
      get: async () => ({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        apiKey: 'anthropic-test',
        model: 'test',
        protocol: 'anthropic',
      }),
    },
    new InteractionTools(),
  );
  const r = await runtime.step(input(runtime, 'hello'));
  assert.equal(r.stop, 'complete');
  assert.equal(r.text, 'hello');
  assert.equal(seen.path.split('?')[0], '/v1/messages');
  assert.equal(seen.key, 'anthropic-test');
  assert.equal(seen.body.stream, true);
});

test('Pi tool image reaches the provider and deferred task is returned to the harness',async t=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf5kAAAAASUVORK5CYII=';
 const tools={tools:()=>[{name:'page',label:'page',description:'read page',parameters:{type:'object',properties:{}},execute:async()=>({text:'source',images:[{data:png,mimeType:'image/png'}],pause:false})}]};
 const {runtime,requests}=await provider(t,(body,res)=>{
  if(body.messages.some(m=>m.role==='tool')){chunk(res,{content:'已看原图'});chunk(res,{},'stop');done(res);return;}
  chunk(res,{tool_calls:[{index:0,id:'read',type:'function',function:{name:'page',arguments:'{}'}}]});chunk(res,{},'tool_calls');done(res);
 },tools);
 const a=await runtime.step(input(runtime,'read'));assert.ok(JSON.stringify(a.checkpoint).includes(png));
 const b=await runtime.step({...input(runtime,''),checkpoint:a.checkpoint});assert.equal(b.text,'已看原图');assert.ok(JSON.stringify(requests[1]).includes('data:image/png;base64,'+png));
 tools.tools=()=>[{name:'page',label:'page',description:'start job',parameters:{type:'object',properties:{}},execute:async()=>({text:'queued',deferred:{workspaceId:'book',jobId:'job'},pause:false})}];
 const c=await runtime.step(input(runtime,'start job'));assert.deepEqual(c.deferred,[{workspaceId:'book',jobId:'job'}]);assert.equal(c.stop,'continue');
});
