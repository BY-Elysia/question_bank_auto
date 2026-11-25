import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { hashPassword } from '../dist/app/shared/auth/gate.js';
import { PageImageVariants } from '../dist/app/modules/textbooks/infrastructure/page-image-variants.js';
import { ScriptedSkills, pdfBuffer } from './helpers.mjs';

test('Authenticated image variants preserve originals, serve lossless detail, and revalidate browser caches', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'page-image-http-'));
  const system = await createApplication({
    root,
    skills: new ScriptedSkills(),
    access: {
      username: 'admin',
      passwordHash: hashPassword('image-test'),
      secure: false,
    },
  });
  await system.app.listen(0, '127.0.0.1');
  t.after(async () => {
    await system.app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = await system.app.getUrl();
  const login = await fetch(base + '/api/access/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'image-test' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const request = (url, options = {}) =>
    fetch(base + url, { ...options, headers: { Cookie: cookie, ...options.headers } });
  const pixels = Buffer.alloc(1800 * 1000 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = ((i * 13) ^ (i >> 9)) % 256;
  const original = await sharp(pixels, { raw: { width: 1800, height: 1000, channels: 3 } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('images', new Blob([original], { type: 'image/png' }), 'page.png');
  const upload = await request('/api/workspaces/images?title=Image-cache', {
    method: 'POST',
    body: form,
  });
  assert.equal(upload.status, 201);
  const { id } = await upload.json();
  const view = await (await request('/api/workspaces/' + id)).json();
  const { imageUrl, previewUrl, detailUrl } = view.pages[0];
  const png = await request(imageUrl);
  const pngData = Buffer.from(await png.arrayBuffer());
  assert.equal(png.headers.get('content-type'), 'image/png');
  assert.deepEqual(await sharp(pngData).raw().toBuffer(), pixels);
  const preview = await request(previewUrl);
  const previewData = Buffer.from(await preview.arrayBuffer());
  assert.equal(preview.headers.get('content-type'), 'image/webp');
  assert.equal(preview.headers.get('cache-control'), 'private, no-cache');
  assert.equal(Number(preview.headers.get('content-length')), previewData.length);
  const dimensions = await sharp(previewData).metadata();
  assert.equal(dimensions.width, 1400);
  assert.equal(dimensions.height, 778);
  assert.ok(previewData.length < pngData.length);
  const detail = await request(detailUrl);
  const detailData = Buffer.from(await detail.arrayBuffer());
  assert.deepEqual(await sharp(detailData).raw().toBuffer(), pixels, 'detail must be pixel-exact');
  assert.notEqual(detail.headers.get('etag'), preview.headers.get('etag'));
  const unchanged = await request(previewUrl, {
    headers: { 'If-None-Match': preview.headers.get('etag'), 'Cache-Control': 'max-age=0' },
  });
  assert.equal(unchanged.status, 304);
  assert.equal((await unchanged.arrayBuffer()).byteLength, 0);
  assert.equal(
    (await request(previewUrl, { headers: { 'If-None-Match': detail.headers.get('etag') } }))
      .status,
    200,
  );
  assert.equal((await request(imageUrl + '?variant=arbitrary')).status, 400);
  assert.equal(
    (await request(imageUrl.replace('/1/image', '/9/image') + '?variant=preview')).status,
    404,
  );
  assert.deepEqual(Buffer.from(await (await request(imageUrl)).arrayBuffer()), pngData);
  await request('/api/access/logout', { method: 'POST' });
  for (const url of [imageUrl, previewUrl, detailUrl]) {
    const denied = await request(url, {
      headers: { 'If-None-Match': preview.headers.get('etag') },
    });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('cache-control'), 'no-store');
  }
});

test('Derivative generation is coalesced, persisted, and invalidated when source pixels change', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'page-image-cache-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, '1.png');
  const write = (color) =>
    sharp({ create: { width: 120, height: 180, channels: 3, background: color } })
      .png()
      .toFile(source);
  await write('white');
  const variants = new PageImageVariants();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => variants.file(source, 'detail')),
  );
  assert.equal(new Set(results).size, 1);
  const before = await fs.stat(results[0]);
  assert.equal(await new PageImageVariants().file(source, 'detail'), results[0]);
  assert.equal((await fs.stat(results[0])).mtimeMs, before.mtimeMs);
  await write('black');
  await fs.utimes(source, new Date(), new Date(Date.now() + 2000));
  const changed = await variants.file(source, 'detail');
  assert.notEqual(changed, results[0]);
  assert.deepEqual(await sharp(changed).raw().toBuffer(), await sharp(source).raw().toBuffer());
  assert.ok((await fs.readdir(path.dirname(changed))).every((name) => !name.endsWith('.tmp')));
});

test('PDF pages expose preview and lossless detail without changing their original PNG contract', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'page-image-pdf-'));
  const system = await createApplication({ root, skills: new ScriptedSkills() });
  await system.app.listen(0, '127.0.0.1');
  t.after(async () => {
    await system.app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = await system.app.getUrl();
  const book = await (
    await fetch(base + '/api/textbooks?title=PDF-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBuffer(1),
    })
  ).json();
  const url = base + `/api/textbooks/${book.id}/pages/1/image`;
  const preview = await fetch(url + '?variant=preview');
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('content-type'), 'image/webp');
  const png = Buffer.from(await (await fetch(url)).arrayBuffer());
  const detail = Buffer.from(await (await fetch(url + '?variant=detail')).arrayBuffer());
  assert.deepEqual(await sharp(png).raw().toBuffer(), await sharp(detail).raw().toBuffer());
});

test('PageImages isolates caller abort signals while still aborting when all waiters cancel', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'page-image-signal-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { BookStore } = await import('../dist/app/modules/textbooks/infrastructure/book-store.js');
  const { FileAssets } =
    await import('../dist/app/modules/textbooks/infrastructure/file-assets.js');
  const { PageImages } =
    await import('../dist/app/modules/textbooks/infrastructure/page-images.js');
  const store = new BookStore(root);
  await store.init();
  const assets = new FileAssets(root);
  const now = new Date().toISOString();
  await store.create({
    schemaVersion: '1.0',
    id: 'b1',
    workspaceId: null,
    workspaceCommit: null,
    workflowLock: null,
    extractionContext: null,
    title: 't',
    sourceKind: 'pdf',
    revision: 0,
    pages: [{ number: 1, status: 'uploaded', width: null, height: null, blank: false }],
    document: { sections: [], contents: [], issues: [], processedPages: [] },
    proposals: [],
    jobs: [],
    changes: [],
    createdAt: now,
    updatedAt: now,
  });

  const samplePng = await sharp({
    create: { width: 40, height: 40, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  let abortedSignals = 0;
  let release;
  const images = new PageImages(
    store,
    {
      async count() {
        return 1;
      },
      async page(_src, dir, number, signal) {
        await new Promise((resolve, reject) => {
          release = resolve;
          signal?.addEventListener(
            'abort',
            () => {
              abortedSignals++;
              reject(signal.reason);
            },
            { once: true },
          );
        });
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `${number}.png`), samplePng);
        return { width: 40, height: 40 };
      },
    },
    assets,
  );

  const c1 = new AbortController();
  const c2 = new AbortController();
  const p1 = images.ensure('b1', 1, c1.signal);
  const p2 = images.dataUrl('b1', 1, c2.signal);
  while (!release) await new Promise((r) => setTimeout(r, 2));
  c1.abort(new Error('first caller cancelled'));
  await assert.rejects(p1, /first caller cancelled/);
  assert.equal(abortedSignals, 0);
  release();
  assert.ok((await p2).startsWith('data:image/png;base64,'));

  // Reset page to unrendered and verify sole waiter abort still cancels underlying PDF render.
  await store.update('b1', (b) => {
    b.pages[0].width = null;
    b.pages[0].height = null;
  });
  release = null;
  const c3 = new AbortController();
  const p3 = images.ensure('b1', 1, c3.signal);
  while (!release) await new Promise((r) => setTimeout(r, 2));
  c3.abort(new Error('sole caller cancelled'));
  await assert.rejects(p3, /sole caller cancelled/);
  assert.equal(abortedSignals, 1);
});
