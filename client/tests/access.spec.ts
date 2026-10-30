import { test, expect } from '@playwright/test';
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
