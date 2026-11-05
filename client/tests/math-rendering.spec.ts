import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

// Real stored content from the reported textbook, including a cross-page proof.
const contents = JSON.parse(
  await readFile(new URL('./fixtures/textbook-math.json', import.meta.url), 'utf8'),
);

async function openFixture(page: Page, text?: string) {
  const buffer = await sharp({
    create: { width: 600, height: 800, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const response = await page.request.post('/api/workspaces/images?title=公式排版回归', {
    multipart: { images: { name: 'math.png', mimeType: 'image/png', buffer } },
  });
  expect(response.status()).toBe(201);
  const workspace = await response.json();
  await page.route(`**/api/workspaces/${workspace.id}*`, async (route) => {
    const original = await route.fetch();
    const view = await original.json();
    view.workspace.status = 'needs_review';
    view.revision = 1;
    view.nextStep = 'review';
    view.actions = { ...view.actions, configure: false, review: true };
    view.document.contents = text === undefined ? contents : [{ ...contents[0], text }];
    view.document.sections = [];
    await route.fulfill({ json: view });
  });
  await page.goto(`/#/workspace/${workspace.id}`);
  return workspace.id;
}

test('Slow workspace loading never flashes raw LaTeX; textbook proofs and displays render', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Capture transient raw fallbacks too, not just the eventual rendered state.
  await page.addInitScript(() => {
    const state = window as typeof window & { rawMathFlashed: boolean };
    state.rawMathFlashed = false;
    new MutationObserver(() => {
      for (const node of document.querySelectorAll('.content-body > p'))
        if (node.textContent?.includes('\\lim')) state.rawMathFlashed = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.route(/\/assets\/(Workspace|Review|RichText)-.*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  const id = await openFixture(page);
  await expect(page.getByRole('status')).toContainText('正在载入工作区');
  await expect(page.locator('.content-card')).toHaveCount(2);
  await expect(page.locator('.katex').first()).toBeVisible();
  expect(await page.locator('.katex').count()).toBeGreaterThan(30);
  expect(await page.evaluate(() => (window as any).rawMathFlashed)).toBe(false);
  await expect(page.locator('.katex-error')).toHaveCount(0);
  const paragraph = page.locator('.content-body').first();
  await expect(paragraph.locator('.katex-display')).toHaveCount(1);
  // A display is a sibling of prose, never a div illegally nested in a p.
  await expect(paragraph.locator('p .katex-display')).toHaveCount(0);
  await expect(page.locator('.subquestion')).toHaveCount(2);
  await expect(page.locator('.content-card').nth(1).locator('.page-reference')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('textbook-math-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '编辑', exact: true }).nth(1).click();
  await expect(page.getByRole('textbox', { name: '题干', exact: true })).toHaveValue(
    contents[1].question.prompt,
  );
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('textbook-math-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Math layout preserves prose, escaped dollars, code, aligned rows and invalid source', async ({
  page,
}) => {
  const text = [
    String.raw`行内 $x^2$，前文 $$\begin{aligned}a&=b\\c&=d\end{aligned}$$ 后文。`,
    '$$\nx+1\n$$',
    '转义 \\$5；代码：`$$x+1$$`',
    '```text\n$$not math$$\n```',
    String.raw`错误公式 $\frac{1}{$，其余文字仍显示。`,
  ].join('\n\n');
  const id = await openFixture(page, text);
  const body = page.locator('.content-body');
  await expect(body.locator('.katex-display')).toHaveCount(2);
  await expect(body.locator('.katex-error')).toHaveCount(1);
  await expect(body).toContainText('前文');
  await expect(body).toContainText('后文');
  await expect(body).toContainText('转义 $5');
  await expect(body).toContainText('其余文字仍显示');
  await expect(body.locator('code').first()).toHaveText('$$x+1$$');
  await expect(body.locator('pre code')).toHaveText('$$not math$$\n');
  await expect(body.locator('.katex-mathml annotation').first()).toHaveText('x^2');
  await page.request.delete(`/api/workspaces/${id}`);
});
