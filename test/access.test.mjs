import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { hashPassword } from '../dist/app/shared/auth/gate.js';
test('Access gate protects every API path, validates credentials, blocks CSRF and revokes sessions', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'access-test-'));
  const system = await createApplication({
    root,
    access: {
      username: 'admin',
      passwordHash: hashPassword('test-secret-password'),
      secure: false,
    },
  });
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  t.after(async () => {
    await system.app.close();
    await rm(root, { recursive: true, force: true });
  });
  for (const p of [
    '/api/workspaces',
    '/API/workspaces',
    '/api/textbooks/unknown/pages/1/image',
    '/api/textbooks/unknown/export.zip',
  ])
    assert.equal((await fetch(base + p)).status, 401, p);
  const post = (p, body, headers = {}) =>
    fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await post('/api/access/login', { username: 'admin', password: 'wrong' })).status,
    401,
  );
  assert.equal(
    (
      await post(
        '/api/access/login',
        { username: 'admin', password: 'test-secret-password' },
        { Origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  const login = await post('/api/access/login', {
    username: 'admin',
    password: 'test-secret-password',
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=2592000/);
  assert.match(cookie, /Expires=/);
  const auth = { Cookie: cookie.split(';')[0] };
  assert.equal((await fetch(base + '/api/workspaces', { headers: auth })).status, 200);
  assert.equal((await post('/api/access/logout', {}, auth)).status, 204);
  assert.equal((await fetch(base + '/api/workspaces', { headers: auth })).status, 401);
  for (let i = 0; i < 8; i++)
    assert.equal(
      (await post('/api/access/login', { username: 'admin', password: 'wrong' })).status,
      401,
    );
  assert.equal(
    (await post('/api/access/login', { username: 'admin', password: 'test-secret-password' }))
      .status,
    429,
  );
});

test('Persistent login survives application restarts; logout and credential changes revoke it', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'persistent-access-'));
  const config = { username: 'admin', passwordHash: hashPassword('persistent-test'), secure: true };
  let system;
  const boot = async (access = config) => {
    system = await createApplication({ root, access });
    await system.app.listen(0, '127.0.0.1');
    return system.app.getUrl();
  };
  t.after(async () => {
    await system?.app.close();
    await rm(root, { recursive: true, force: true });
  });
  let base = await boot();
  const login = async () => {
    const response = await fetch(base + '/api/access/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'persistent-test' }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /; Secure/);
    return response.headers.get('set-cookie').split(';')[0];
  };
  const first = await login();
  const file = path.join(root, 'access', 'sessions.json');
  const saved = await readFile(file, 'utf8');
  assert.ok(!saved.includes(first.split('=')[1]));
  assert.ok(!saved.includes('persistent-test'));
  assert.ok(!saved.includes(config.passwordHash));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(path.dirname(file))).mode & 0o777, 0o700);
  await system.app.close();
  base = await boot();
  assert.equal((await fetch(base + '/api/workspaces', { headers: { Cookie: first } })).status, 200);
  assert.equal(
    (await (await fetch(base + '/api/access/session', { headers: { Cookie: first } })).json())
      .authenticated,
    true,
  );
  assert.equal(
    (await fetch(base + '/api/access/logout', { method: 'POST', headers: { Cookie: first } }))
      .status,
    204,
  );
  await system.app.close();
  base = await boot();
  assert.equal((await fetch(base + '/api/workspaces', { headers: { Cookie: first } })).status, 401);
  const second = await login();
  await system.app.close();
  base = await boot({ ...config, passwordHash: hashPassword('changed-password') });
  assert.equal(
    (await fetch(base + '/api/workspaces', { headers: { Cookie: second } })).status,
    401,
  );
});
