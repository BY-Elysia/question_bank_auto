import { test, expect } from '@playwright/test';
import sharp from 'sharp';
async function book(page: any) {
  const buffer = await sharp({
    create: { width: 160, height: 220, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const w = await (
    await page.request.post('/api/workspaces/images?title=' + encodeURIComponent('助手来源测试'), {
      multipart: { images: { name: 'p.png', mimeType: 'image/png', buffer } },
    })
  ).json();
  await page.goto('/#/workspace/' + w.id);
  await page.getByLabel('学科').fill('数学');
  await page.getByRole('button', { name: '开始提取', exact: true }).click();
  await expect(page.getByRole('button', { name: '向助手提问' }).first()).toBeVisible();
  return w.id;
}
test('Question entry selects scoped context, tools cite evidence, source image opens and locates the question', async ({
  page,
}) => {
  const id = await book(page);
  const c=await(await page.request.post('/api/assistant/conversations')).json();
  await page.request.put(`/api/assistant/conversations/${c.id}/scope`,{data:{workspaceIds:[id]}});
  await page.evaluate(id=>sessionStorage.setItem('assistant-conversation',id),c.id);
  await page.goto('/#/assistant');
  await page.getByLabel('消息',{exact:true}).fill('查询题目并引用来源');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.citation-links button')).toHaveCount(1);
  await expect(page.locator('.chat-message.assistant .katex')).toBeVisible();
  await page.locator('.inline-citation').click();
  await expect(page.getByRole('img', { name: '来源第 1 页原图' })).toBeVisible();
  await expect(page.locator('.citation-image>span')).toHaveCount(1);
  await page.getByRole('button', { name: '在教材中定位此题' }).click();
  await expect(page.locator('.content-card.selected')).toBeVisible();
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await expect(page.locator('.citation-links button')).toHaveCount(1);
  await page.getByRole('button', { name: '教材资料 · 1' }).click();
  await page.locator('.knowledge-list input').uncheck();
  await page.getByRole('button', { name: '应用资料范围' }).click();
  await page.locator('.citation-links button').click();
  await expect(page.getByRole('alert')).toContainText('来源不在当前资料范围');
  await expect(page.locator('.citation-image img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.request.delete('/api/workspaces/' + id);
});
test('New conversation can choose material and mobile citations stay within the screen', async ({
  page,
}) => {
  const id = await book(page);
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.getByLabel('消息', { exact: true }).fill('查询题目并引用来源');
  await page.getByRole('button', { name: '教材资料', exact: true }).click();
  await page.locator('.knowledge-list input').first().check();
  await page.getByRole('button', { name: '应用资料范围' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('查询题目并引用来源');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.citation-links button')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.citation-links button').click();
  await expect(page.getByRole('img', { name: '来源第 1 页原图' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.keyboard.press('Escape');
  await page.request.delete('/api/workspaces/' + id);
});
