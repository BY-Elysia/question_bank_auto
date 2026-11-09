import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
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
  await page.getByRole('button', {name:'不包含答案',exact:true}).click();
  await page.getByRole('button', { name: '开始提取', exact: true }).click();
  await expect(page.getByRole('button', { name: '下方添加题目' })).toBeVisible();
  await page.getByRole('button', {name:/待审候选/}).click();
  await page.getByRole('button', {name:'接受',exact:true}).click();
  await page.getByRole('button', {name:/^完整题目/}).click();
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
  expect((await page.request.get(`/api/textbooks/${id}/export.json`)).status()).toBe(200);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const downloaded = await downloading;
  const result = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  for (const question of result.questions) {
    if (question.questionType === 'SHORT_ANSWER') {
      expect(question.rubric).toEqual([]);
      continue;
    }
    expect(question.rubric).toHaveLength(3);
    expect(question.rubric.reduce((n: number, r: { maxScore: number }) => n + r.maxScore, 0)).toBe(
      question.defaultScore,
    );
  }
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

test('Conversation switches clear old messages and preserve independent unsent drafts', async ({
  page,
}) => {
  const make = (id: string) => ({
    id,
    title: `对话${id}`,
    updatedAt: new Date().toISOString(),
    messages: [
      { id: `${id}-message`, role: 'user', content: `消息${id}`, status: 'complete', error: null },
    ],
  });
  await page.route('**/api/assistant/conversations', (r) =>
    r.fulfill({
      json: [
        { id: 'a', title: '对话a', pending: false },
        { id: 'b', title: '对话b', pending: false },
      ],
    }),
  );
  await page.route('**/api/assistant/conversations/*/state', async (r) => {
    if (r.request().url().endsWith('/b/state'))
      await new Promise((resolve) => setTimeout(resolve, 500));
    await r.fulfill({
      json: { conversation: make(r.request().url().split('/').at(-2)!), runs: [] },
    });
  });
  await page.goto('/#/assistant');
  await page.getByRole('button', { name: '对话a', exact: true }).click();
  await expect(page.locator('.chat-messages')).toContainText('消息a');
  await page.getByLabel('消息', { exact: true }).fill('a的草稿');
  await page.getByRole('button', { name: '对话b', exact: true }).click();
  await expect(page.locator('.chat-messages')).not.toContainText('消息a');
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('');
  await page.getByLabel('消息', { exact: true }).fill('b的草稿');
  await expect(page.locator('.chat-messages')).toContainText('消息b');
  await page.getByRole('button', { name: '对话a', exact: true }).click();
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('a的草稿');
});

test('Model settings refresh cannot overwrite an unsaved draft', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/profile/model', (r) =>
    r.fulfill({
      json: {
        baseUrl: `https://server${++calls}.test/v1`,
        model: 'test',
        visionModel: '',
        protocol: 'chat',
        prefixCache: false,
        hasApiKey: true,
      },
    }),
  );
  await page.goto('/#/profile');
  await page.getByLabel('API 基础地址').fill('https://my-draft.test/v1');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => calls).toBeGreaterThan(1);
  await expect(page.getByLabel('API 基础地址')).toHaveValue('https://my-draft.test/v1');
});

test('Home loads without textbook tools; sidebar has no create action; assistant settings are scoped', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '教材库', exact: true })).toBeVisible();
  await expect(page.locator('.app-sidebar').getByText('新建工作区', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '新建工作区', exact: true }).first()).toBeVisible();
  expect(
    requests.some((u) => /\/assets\/(Workspace-|UploadDialog-|RichText-|Review-|dialog-)/.test(u)),
  ).toBe(false);
  expect(requests.filter((u) => u.endsWith('/api/access/session'))).toHaveLength(1);
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await expect(page.getByRole('heading', { name: '今天，想聊些什么？' })).toBeVisible();
  await expect(page.locator('.chat-composer')).toBeVisible();
  await page.getByRole('button', { name: '模型设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '助手模型设置', exact: true })).toBeVisible();
  await page.getByLabel('API 基础地址').fill('https://assistant.example/v1');
  await page.getByLabel('API Key').fill('independent-test');
  await page.getByLabel('推理／对话模型').fill('assistant-only');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.getByText('模型配置已保存')).toBeVisible();
  const config = await (await page.request.get('/api/profile/model')).json();
  expect(config.model).not.toBe('assistant-only');
  await page.getByRole('button', { name: '返回对话', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.chat-composer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
