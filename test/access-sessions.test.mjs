import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileSessionStore } from '../dist/app/shared/auth/file-session-store.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sessions-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'access', 'sessions.json');
  const open = () => FileSessionStore.open(file, 'admin', 'credential-fingerprint-input');
  return { root, file, open, store: await open() };
}
const key = (n) => n.toString(16).padStart(64, '0');

test('Session persistence serializes concurrent logins, rotates tokens and rejects expired sessions', async (t) => {
  const { file, store, open } = await fixture(t);
  const now = Date.now();
  await Promise.all([
    store.replace('', key(1), now + 60000, now),
    store.replace('', key(2), now + 60000, now),
  ]);
  const reopened = await open();
  assert.ok(await reopened.has(key(1), now));
  assert.ok(await reopened.has(key(2), now));
  assert.equal(await reopened.has(key(1), now + 60000), false);
  await reopened.replace(key(1), key(3), now + 60000, now);
  const rotated = await open();
  assert.equal(await rotated.has(key(1), now), false);
  assert.ok(await rotated.has(key(3), now));
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  state.sessions[0][1] = now - 1;
  await fs.writeFile(file, JSON.stringify(state));
  const cleaned = await open();
  assert.equal(await cleaned.has(state.sessions[0][0], now), false);
  assert.ok(
    JSON.parse(await fs.readFile(file, 'utf8')).sessions.every(([, expiry]) => expiry > now),
  );
});

test('Failed persistence does not publish a login and later writes can recover', async (t) => {
  const { file, store } = await fixture(t);
  const now = Date.now();
  await store.replace('', key(1), now + 60000, now);
  const dir = path.dirname(file);
  await fs.rename(dir, dir + '-saved');
  await fs.writeFile(dir, 'blocked');
  await assert.rejects(store.replace(key(1), key(2), now + 60000, now));
  assert.ok(await store.has(key(1), now));
  assert.equal(await store.has(key(2), now), false);
  await fs.rm(dir);
  await fs.rename(dir + '-saved', dir);
  await store.replace(key(1), key(2), now + 60000, now);
  assert.equal(await store.has(key(1), now), false);
  assert.ok(await store.has(key(2), now));
  const saved = await fs.readFile(file, 'utf8');
  await store.revoke(key(99));
  assert.equal(await fs.readFile(file, 'utf8'), saved);
});

test('Unreadable or malformed session state never grants access', async (t) => {
  const { file, open } = await fixture(t);
  await fs.writeFile(file, '{"version":1,"sessions":[["arbitrary",9999999999999]]}');
  await assert.rejects(open(), /Invalid session storage/);
});
