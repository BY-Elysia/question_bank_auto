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

test('Whole question preview preserves cross-page children and supports source navigation', async ({
  page,
}) => {
  const id = await openFixture(page);
  await page.getByRole('button', { name: /^完整题目/ }).click();
  await expect(page.locator('.content-card')).toHaveCount(1);
  await expect(page.locator('.subquestion')).toHaveCount(2);
  await expect(page.locator('.katex').first()).toBeVisible();
  await page.getByRole('button', { name: /查看题目 .* 第 2 页原图/ }).click();
  await expect(page.locator('.content-card')).toHaveCount(1);
  await expect(page.locator('.subquestion')).toHaveCount(2);
  await page.getByLabel('搜索完整题目').fill('不存在的题干xyz');
  await expect(page.getByText('暂无匹配题目')).toBeVisible();
  await page.getByLabel('搜索完整题目').fill('');
  await page.getByRole('button', { name: '查看内容块与修复' }).click();
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible();
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Reference exercise options render fractions, limits and roots in block and full preview', async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile(new URL('./fixtures/exercise-options.json', import.meta.url), 'utf8'),
  );
  const id = await openFixture(page);
  await page.route(`**/api/workspaces/${id}*`, async (route) => {
    const response = await route.fetch();
    const view = await response.json();
    view.workspace.status = 'needs_review';
    view.revision = 1;
    view.nextStep = 'review';
    view.actions.review = true;
    view.document.contents = fixture;
    view.document.sections = [];
    await route.fulfill({ json: view });
  });
  await page.reload();
  for (const full of [false, true]) {
    if (full) await page.getByRole('button', { name: /^完整题目/ }).click();
    await expect(page.locator('.question-options > div')).toHaveCount(8);
    await expect(page.locator('.question-options .katex').first()).toBeVisible();
    expect(await page.locator('.question-options .katex').count()).toBeGreaterThanOrEqual(8);
    await expect(page.locator('.katex-error')).toHaveCount(0);
    await expect(page.locator('.subquestion')).toHaveCount(0);
  }
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Answer failure shows completed extraction and formal review instead of failed extraction preview', async ({
  page,
}) => {
  const id = await openFixture(page);
  await page.route(`**/api/workspaces/${id}*`, async (route) => {
    const response = await route.fetch();
    const view = await response.json();
    view.workspace.status = 'failed';
    view.workspace.mergedRevision = 1;
    view.workspace.answersJobId = 'failed-answers';
    view.workspace.error = 'The operation was aborted due to timeout';
    view.revision = 1;
    view.document.processedPages = [1];
    view.document.contents = contents;
    view.actions = { ...view.actions, resume: true, review: true, export: true };
    view.jobs = [
      {
        id: 'failed-answers',
        kind: 'answers',
        status: 'failed',
        error: 'The operation was aborted due to timeout',
        issues: [],
        supersededBy: null,
        processedIds: [],
        request: { cache: 'prefix' },
      },
    ];
    await route.fulfill({ json: view });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '每一处细节，都可以核对。' })).toBeVisible();
  await expect(page.getByRole('button', { name: '继续补全答案' })).toBeVisible();
  await expect(page.getByText('题目提取已完成，答案补全已中断。', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: '提取预览' })).toHaveCount(0);
  await expect(page.locator('.steps > div').nth(3)).toHaveClass('current');
  await expect(
    page.getByText('The operation was aborted due to timeout', { exact: true }),
  ).toHaveCount(0);
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Historical answer findings clear only after the same content is processed again', async ({
  page,
}) => {
  const id = await openFixture(page);
  let processed = false;
  await page.route(`**/api/workspaces/${id}*`, async (route) => {
    const view = await (await route.fetch()).json();
    view.workspace.status = 'needs_review';
    view.revision = 1;
    view.document.contents = contents;
    view.actions.review = true;
    const common = {
      kind: 'answers',
      baseRevision: 1,
      request: {},
      supersededBy: null,
      error: null,
    };
    view.jobs = [
      {
        ...common,
        id: 'old',
        status: 'needs_review',
        processedIds: [contents[0].id],
        issues: [
          {
            code: 'ANSWER_INVALID_MATH',
            message: '旧答案公式未完成',
            contentId: contents[0].id,
            page: 1,
            severity: 'warning',
          },
        ],
      },
      {
        ...common,
        id: 'new',
        status: 'needs_review',
        processedIds: processed ? [contents[0].id] : [],
        issues: [],
      },
    ];
    await route.fulfill({ json: view });
  });
  await page.reload();
  await page.getByRole('button', { name: /问题记录/ }).click();
  await expect(page.getByText('旧答案公式未完成')).toBeVisible();
  processed = true;
  await page.reload();
  await page.getByRole('button', { name: /问题记录/ }).click();
  await expect(page.getByText('旧答案公式未完成')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /问题记录/ })).toContainText('0');
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Completed workspace fills source width by default and can switch to full page', async ({page}) => {
  const id = await openFixture(page);
  await page.route(`**/api/workspaces/${id}*`, async route => {
    const view = await (await route.fetch()).json();
    if (!view.workspace) return route.fulfill({json:view});
    view.workspace.status='needs_review'; view.workspace.mergedRevision=1;
    view.document.processedPages=[1]; view.document.contents=contents;
    view.revision=1; view.actions.review=true;
    await route.fulfill({json:view});
  });
  await page.reload();
  await expect(page.locator('.review-mode')).toBeVisible();
  await expect(page.getByRole('img',{name:'教材第 1 页原图'})).toBeVisible();
  const layout=await page.locator('.review-layout').boundingBox();
  expect(layout!.y).toBeLessThan(280);
  expect(layout!.height).toBeGreaterThan(650);
  const source=await page.locator('.page-image:visible').boundingBox();
  const scroll=await page.locator('.image-scroll').boundingBox();
  expect(source!.width).toBeGreaterThan(scroll!.width - 20);
  await page.getByRole('button',{name:'适应画布',exact:true}).click();
  const fitted=await page.locator('.page-image:visible').boundingBox();
  expect(fitted!.height).toBeLessThanOrEqual(scroll!.height);
  await page.getByRole('button',{name:'适应宽度',exact:true}).click();
  expect((await page.locator('.page-image:visible').boundingBox())!.width).toBeCloseTo(source!.width, 0);
  await page.request.delete(`/api/workspaces/${id}`);
});
