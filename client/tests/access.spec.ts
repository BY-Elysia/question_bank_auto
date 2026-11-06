import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('Login gate supports errors, refresh persistence and logout', async ({ page }) => {
  test.skip(process.env.ACCESS_TEST !== '1');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '登录教材工作台' })).toBeVisible();
  expect((await page.request.get('/api/workspaces')).status()).toBe(401);
  await page.getByLabel('密码', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('账号或密码错误');
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '教材库', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '教材库', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '登录教材工作台' })).toBeVisible();
  expect((await page.request.get('/api/workspaces')).status()).toBe(401);
});

test('Persistent browser cookies keep login across browser restarts and logout clears it', async ({
  playwright,
}, testInfo) => {
  test.skip(process.env.ACCESS_TEST !== '1');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'textbook-browser-login-'));
  const launch = () =>
    playwright.chromium.launchPersistentContext(profile, {
      channel: process.env.PW_BROWSER_CHANNEL,
      headless: true,
      baseURL: testInfo.project.use.baseURL,
    });
  let context = await launch();
  try {
    let page = await context.newPage();
    await page.goto('/');
    await page.getByLabel('密码', { exact: true }).fill('browser-test-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '教材库', exact: true })).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name === 'textbook_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(29 * 24 * 3600);
    expect(await page.evaluate(() => document.cookie)).not.toContain('textbook_session');
    await context.close();
    context = await launch();
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '教材库', exact: true })).toBeVisible();
    expect((await page.request.get('/api/workspaces')).status()).toBe(200);
    await page.getByRole('button', { name: '退出登录' }).click();
    await expect(page.getByRole('heading', { name: '登录教材工作台' })).toBeVisible();
    await context.close();
    context = await launch();
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '登录教材工作台' })).toBeVisible();
    expect((await page.request.get('/api/workspaces')).status()).toBe(401);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
