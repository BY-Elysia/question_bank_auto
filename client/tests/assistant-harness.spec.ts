import { test, expect } from '@playwright/test';
test('Streaming can be interrupted, queued messages are consumed and stop preserves output', async ({
  page,
}) => {
  await page.goto('/#/assistant');
  await page.getByLabel('消息', { exact: true }).fill('慢速测试');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText('正在逐步');
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible();
  await page.getByLabel('发送方式').selectOption('interrupt');
  await page.getByLabel('消息', { exact: true }).fill('改成简短回答');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.run-status')).toContainText('已完成');
  await expect(page.locator('.chat-message.assistant').last()).toContainText('这是 AI 助手回复');
  await page.getByLabel('消息', { exact: true }).fill('慢速测试第二轮');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('正在逐步');
  await page.getByRole('button', { name: '停止生成' }).click();
  await expect(page.locator('.run-status')).toContainText('已停止');
  await page.reload();
  await expect(page.locator('.run-status')).toContainText('已停止');
  await expect(page.locator('.chat-message.assistant').last()).toContainText('正在逐步');
});
test('Pending question survives reload; answer continues; management and mobile layout work', async ({
  page,
}) => {
  await page.goto('/#/assistant');
  await page.getByLabel('消息', { exact: true }).fill('询问测试');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page.locator('.interaction-card').getByText('选择学习学科', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator('.interaction-card').getByText('选择学习学科', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: '数学', exact: true }).click();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('收到你的选择：数学');
  await expect(page.locator('.run-status')).toContainText('已完成');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await page.getByLabel('对话名称').fill('Harness 浏览器测试');
  await page.getByRole('button', { name: '保存名称' }).click();
  await expect(page.getByRole('button', { name: 'Harness 浏览器测试', exact: true })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '删除对话', exact: true }).click();
  await expect(page.getByRole('heading', { name: '今天，想聊些什么？' })).toBeVisible();
});

test('The main composer can answer a waiting question without leaving a stranded queue', async ({
  page,
}) => {
  await page.goto('/#/assistant');
  await page.getByLabel('消息', { exact: true }).fill('询问测试');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.interaction-card')).toBeVisible();
  await page.getByLabel('消息', { exact: true }).fill('英语，每周三次');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.run-status')).toContainText('已完成');
  await expect(page.locator('.chat-message.assistant').last()).toContainText('英语，每周三次');
  await expect(page.locator('.queued-input')).toHaveCount(0);
});

test('Paged history remains visible when newer messages shift the initial window', async ({
  page,
}) => {
  const msg = (n: number) => ({
    id: String(n),
    role: n % 2 ? 'user' : 'assistant',
    content: `历史消息编号${n}结束`,
    status: 'complete',
    error: null,
  });
  let newer = false,
    olderRequests = 0;
  await page.route('**/api/assistant/conversations', (r) =>
    r.fulfill({ json: [{ id: 'history', title: '分页测试', pending: false }] }),
  );
  await page.route('**/api/assistant/conversations/history/state', (r) =>
    r.fulfill({
      json: {
        conversation: {
          id: 'history',
          title: '分页测试',
          updatedAt: 'now',
          messages: Array.from({ length: 50 }, (_, i) => msg(i + (newer ? 53 : 51))),
        },
        runs: [],
        nextCursor: newer ? '53' : '51',
      },
    }),
  );
  await page.route('**/api/assistant/conversations/history/messages?*', (r) => {
    olderRequests++;
    return r.fulfill({
      json: { messages: Array.from({ length: 50 }, (_, i) => msg(i + 1)), nextCursor: null },
    });
  });
  await page.goto('/#/assistant');
  await page.getByRole('button', { name: '分页测试', exact: true }).click();
  await expect(page.locator('.chat-message')).toHaveCount(50);
  expect(olderRequests).toBe(0);
  await page.getByRole('button', { name: '显示更早消息' }).click();
  await expect(page.locator('.chat-message')).toHaveCount(100);
  newer = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.chat-message')).toHaveCount(102);
  await expect(page.getByText('历史消息编号51结束', { exact: true })).toHaveCount(1);
  expect(olderRequests).toBe(1);
});
