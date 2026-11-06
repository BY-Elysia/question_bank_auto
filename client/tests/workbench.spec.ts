import { test, expect } from '@playwright/test';
import sharp from 'sharp';
const png = () =>
  sharp({ create: { width: 300, height: 400, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
test('Complete-question UI supports insertion, metadata editing, per-question tools and no detail images', async ({
  page,
}) => {
  const images: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/image')) images.push(r.url());
  });
  const buffer = await png();
  const upload = await page.request.post('/api/workspaces/images?title=插题端测', {
    multipart: { images: { name: 'page.png', mimeType: 'image/png', buffer } },
  });
  const { id } = await upload.json();
  await page.goto(`/#/workspace/${id}`);
  await page.getByLabel('学科').fill('数学');
  await page.getByRole('button', { name: '开始提取', exact: true }).click();
  await expect(page.getByRole('button', { name: '下方添加题目' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^内容块/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '核对全书', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '补全缺失答案', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '下方添加题目' }).click();
  await page
    .getByLabel('题目图片')
    .setInputFiles({ name: 'missing.png', mimeType: 'image/png', buffer });
  await page.getByRole('button', { name: '上传并提取' }).click();
  await page.getByRole('button', { name: '全部工作区' }).click();
  await page.goto(`/#/workspace/${id}`);
  await expect(page.locator('.content-card')).toHaveCount(2);
  await expect(page.locator('.content-card').nth(1)).toContainText('补充题目');
  await expect(page.locator('.content-card-header').nth(1)).toContainText('题目 2');
  await expect(page.locator('.katex').first()).toBeVisible();
  await page.getByRole('button', { name: '教材信息', exact: true }).click();
  await page.getByLabel('教材名称', { exact: true }).fill('重新命名的教材');
  await page.getByRole('button', { name: '保存教材信息' }).click();
  await expect(page.getByRole('heading', { name: '重新命名的教材' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '重新命名的教材' })).toBeVisible();
  await page.getByRole('button', { name: '放大', exact: true }).click();
  expect(images.some((u) => u.includes('variant=detail'))).toBe(false);
  const result = await (await page.request.get(`/api/textbooks/${id}/export.json`)).json();
  expect(result.textbook.title).toBe('重新命名的教材');
  expect(result.questions).toHaveLength(2);
  await page.request.delete(`/api/workspaces/${id}`);
});
test('Personal center hides saved keys; assistant conversation survives navigation and renders math', async ({
  page,
}) => {
  await page.goto('/#/profile');
  await expect(page.getByRole('heading', { name: '个人中心', exact: true })).toBeVisible();
  await page.getByLabel('API 基础地址').fill('https://example.test/v1');
  await page.getByLabel('API Key').fill('browser-test-key');
  await page.getByLabel('推理／对话模型').fill('test');
  await page.getByLabel('接口协议').selectOption('chat');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByText('模型配置已保存')).toBeVisible();
  await expect(page.getByLabel('API Key')).toHaveValue('');
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.getByLabel('消息', { exact: true }).fill('你好');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '个人中心', exact: true }).click();
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText('这是 AI 助手回复');
  await expect(page.locator('.chat-message.assistant .katex')).toBeVisible();
  await page.reload();
  await expect(page.locator('.chat-message.assistant')).toContainText('这是 AI 助手回复');
});
