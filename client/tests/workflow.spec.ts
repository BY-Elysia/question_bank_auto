import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
// @ts-expect-error JavaScript fixture is shared with backend tests.
import { pdfBuffer } from '../../test/helpers.mjs';
import sharp from 'sharp';
async function upload(page: Page, title: string, pdf = true) {
  const png = await sharp({ create: { width: 600, height: 800, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  await page.goto('/');
  await page.getByRole('button', { name: '新建工作区', exact: true }).last().click();
  await page.getByLabel('工作区名称').fill(title);
  await page.getByLabel('选择教材文件').setInputFiles(
    pdf
      ? { name: 'textbook.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(2) }
      : [
          { name: 'page-1.png', mimeType: 'image/png', buffer: png },
          { name: 'page-2.png', mimeType: 'image/png', buffer: png },
        ],
  );
  await page.getByRole('button', { name: '创建工作区', exact: true }).click();
  await expect(page.getByRole('heading', { name: '开始前，再了解一下这本教材。' })).toBeVisible({
    timeout: 60000,
  });
  await page.getByLabel('学科').fill('数学');
}
async function complete(page: Page) {
  await page.getByRole('button', { name: '开始提取', exact: true }).click();
  await expect(page.getByRole('heading', { name: '每一处细节，都可以核对。' })).toBeVisible({
    timeout: 60000,
  });
}
test('PDF upload, extraction, source navigation, answers, editing, repair, verification, export and revisions', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await upload(page, '数学教材 · 端到端验证');
  await page.getByRole('button', { name: '不包含答案', exact: true }).click();
  await complete(page);
  await page.getByRole('button', { name: /待审候选/ }).click();
  await expect(page.getByRole('button', { name: '接受', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '接受', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '接受', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '接受', exact: true }).click();
  await expect(page.getByText('没有待审候选')).toBeVisible();
  await page.getByRole('button', { name: /提取结果/ }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  await page
    .getByRole('textbox', { name: '题干', exact: true })
    .fill('人工校对后的题目：已知 f(x) = 2x + 3，求 f(4)。');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('人工校对后的题目：已知 f(x) = 2x + 3，求 f(4)。')).toBeVisible();
  await page.getByRole('button', { name: 'AI 修复', exact: true }).first().click();
  await page.getByLabel('修复要求').fill('对照原图修复题干');
  await page.getByRole('button', { name: '生成修复候选' }).click();
  await page.getByRole('button', { name: /待审候选/ }).click();
  await expect(page.getByText('修复后的题干：求函数值。')).toBeVisible();
  await page.getByRole('button', { name: '拒绝', exact: true }).click();
  await expect(page.getByText('没有待审候选')).toBeVisible();
  await page.getByRole('button', { name: '核对全书' }).click();
  await page.getByRole('button', { name: /问题记录/ }).click();
  await expect(page.getByText('请核对函数中的常数项。')).toHaveCount(2);
  await page.getByRole('button', { name: '定位第 2 页' }).click();
  await expect(page.getByRole('img', { name: '教材第 2 页原图' })).toBeVisible();
  await page.getByRole('button', { name: '上一页' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const exported = await download;
  const data = JSON.parse(await readFile((await exported.path())!, 'utf8'));
  expect(data.metadata.subject).toBe('数学');
  expect(data.contents[0].question.prompt).toContain('人工校对');
  const zipWait = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出资料包' }).click();
  expect((await zipWait).suggestedFilename()).toMatch(/\.zip$/);
  await page.screenshot({ path: testInfo.outputPath('review-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '历史', exact: true }).click();
  await page.getByLabel('选择要恢复的版本').selectOption('1');
  await page.getByRole('button', { name: '恢复为新修订' }).click();
  await expect(page.getByText('人工校对后的题目：已知 f(x) = 2x + 3，求 f(4)。')).toHaveCount(0);
  await page.getByRole('button', { name: '删除工作区', exact: true }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('heading', { name: '教材库' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('Image grouping supports selection and drag, then produces a merged document', async ({
  page,
}, testInfo) => {
  await upload(page, '多章并行 · 图片验证', false);
  await page.getByRole('button', { name: /多章并行/ }).click();
  await expect(page.getByRole('button', { name: '开始提取', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '选择第 1 页', exact: true }).click();
  await page.getByRole('button', { name: '分配到章节', exact: true }).click();
  await page
    .getByRole('button', { name: '选择第 2 页', exact: true })
    .dragTo(page.locator('.group-bucket').nth(1));
  await expect(page.getByText('未分配 0 / 2')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('chapter-groups.png'), fullPage: true });
  await complete(page);
  await expect(page.locator('.content-card')).toHaveCount(1);
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.content-card')).toHaveCount(1);
});
test('Cancelling and reloading preserves a resumable workspace', async ({ page }) => {
  await upload(page, '恢复验证', false);
  await page.getByRole('button', { name: '开始提取', exact: true }).click();
  await page.getByRole('button', { name: '暂停处理', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复处理', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '恢复处理', exact: true }).click();
  await expect(page.getByRole('heading', { name: '每一处细节，都可以核对。' })).toBeVisible({
    timeout: 60000,
  });
});
test('Mobile layout, reduced motion, search and keyboard dialog work', async ({
  page,
}, testInfo) => {
  const buffer = await sharp({
    create: { width: 100, height: 140, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const seeded = await page.request.post(
    '/api/workspaces/images?title=' + encodeURIComponent('移动端测试教材'),
    { multipart: { images: { name: 'page.png', mimeType: 'image/png', buffer } } },
  );
  expect(seeded.status()).toBe(201);
  await page.goto('/');
  await expect(page.locator('.workspace-card').last()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '教材库' })).toBeVisible();
  await page.getByRole('button', { name: '列表视图', exact: true }).click();
  await expect(page.locator('.workspace-grid')).toHaveClass(/is-list/);
  await expect(page.getByRole('button', { name: '列表视图', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '卡片视图', exact: true }).click();
  await expect(page.locator('.workspace-grid')).not.toHaveClass(/is-list/);
  await page.getByLabel('搜索工作区').fill('不存在的教材');
  await expect(page.getByText('没有匹配的工作区')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: '创建工作区', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('Connection errors are visible and can be retried', async ({ page }) => {
  await page.route('**/api/workspaces', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/problem+json',
      body: JSON.stringify({ detail: '测试连接中断' }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('测试连接中断');
  await page.unroute('**/api/workspaces');
  await page.getByRole('button', { name: '重新连接' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('A rejected edit keeps the draft and can be retried without losing workspace state', async ({
  page,
}) => {
  await upload(page, '编辑冲突回归', false);
  await complete(page);
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  const draft = '冲突后仍然保留的人工修改';
  await page.getByRole('textbox', { name: '题干', exact: true }).fill(draft);
  let saves = 0;
  await page.route('**/api/textbooks/*/contents/*', async (route) => {
    saves++;
    if (saves === 1)
      await route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({ detail: '测试版本冲突' }),
      });
    else await route.continue();
  });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('测试版本冲突');
  await expect(page.getByRole('textbox', { name: '题干', exact: true })).toHaveValue(draft);
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
  expect(saves).toBe(2);
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.getByRole('img', { name: '教材第 2 页原图' })).toBeVisible();
  await page.getByRole('button', { name: '上一页' }).click();
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
});

test('Particle effects render, never intercept controls, persist their toggle and respect reduced motion', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const canvas = page.locator('.particle-field');
  const toggle = page.getByRole('button', { name: '粒子动效', exact: true });
  await expect(canvas).toHaveAttribute('data-state', 'running');
  await expect(canvas).toHaveCSS('pointer-events', 'none');
  const paintedPixels = () =>
    canvas.evaluate((element) => {
      const c = element as HTMLCanvasElement;
      const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let painted = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) painted++;
      return painted;
    });
  await expect.poll(paintedPixels).toBeGreaterThan(0);
  await page.mouse.move(620, 250);
  await page.getByRole('button', { name: '新建工作区', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('particles-desktop.png'), fullPage: true });
  await toggle.click();
  await expect(canvas).toHaveAttribute('data-state', 'disabled');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(canvas).toHaveAttribute('data-state', 'disabled');
  await toggle.click();
  await expect(canvas).toHaveAttribute('data-state', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveAttribute('data-state', 'reduced');
  await expect(canvas).toBeHidden();
  expect(await paintedPixels()).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
