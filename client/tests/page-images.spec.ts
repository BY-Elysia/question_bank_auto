import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

async function openBook(page: Page) {
  const buffer = await sharp({
    create: { width: 600, height: 900, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const multipart = new FormData();
  multipart.append('images', new Blob([buffer], { type: 'image/png' }), 'page1.png');
  multipart.append('images', new Blob([buffer], { type: 'image/png' }), 'page2.png');
  const upload = await page.request.post('/api/workspaces/images?title=页图加载回归', {
    multipart,
  });
  expect(upload.status()).toBe(201);
  const { id } = await upload.json();
  await page.route(`**/api/workspaces/${id}*`, async (route) => {
    const response = await route.fetch();
    const view = await response.json();
    view.workspace.status = 'needs_review';
    view.revision = 1;
    view.actions = { ...view.actions, review: true, configure: false };
    view.document.contents = view.pages.map((p: { number: number }) => ({
      id: `content-${p.number}`,
      kind: 'paragraph',
      sectionId: null,
      text: `教材第 ${p.number} 页内容`,
      question: null,
      table: null,
      caption: null,
      sources: [{ page: p.number, box: [0.1, 0.2, 0.9, 0.6] }],
    }));
    await route.fulfill({ json: view });
  });
  await page.goto(`/#/workspace/${id}`);
  return id;
}

test('Page previews reserve layout, preload only the next page, and retain visible pixels during detail loading', async ({
  page,
}, testInfo) => {
  let releasePreview!: () => void, releaseDetail!: () => void;
  const previewGate = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  const detailGate = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/image')) requests.push(request.url());
  });
  await page.route('**/pages/1/image?variant=preview', async (route) => {
    await previewGate;
    await route.continue();
  });
  await page.route('**/pages/1/image?variant=detail', async (route) => {
    await detailGate;
    await route.continue();
  });
  const id = await openBook(page);
  await expect(page.getByText('正在加载页图…')).toBeVisible();
  const canvas = page.locator('.page-image:visible');
  const before = await canvas.boundingBox();
  expect(before!.height / before!.width).toBeCloseTo(1.5, 2);
  await expect(page.locator('.source-box')).toHaveCount(0);
  expect(requests.some((url) => url.includes('/2/image'))).toBe(false);
  releasePreview();
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.source-box')).toHaveCount(1);
  await expect
    .poll(() => requests.some((url) => url.includes('/2/image?variant=preview')))
    .toBe(true);
  expect(requests.some((url) => url.includes('variant=detail'))).toBe(false);
  const after = await canvas.boundingBox();
  expect(after!.height).toBeCloseTo(before!.height, 1);
  const preview = page.getByRole('img', { name: '教材第 1 页原图' });
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(page.getByText('正在加载高清图…')).toBeVisible();
  await expect(preview).toHaveCSS('opacity', '1');
  releaseDetail();
  await expect(page.locator('.page-image-detail:visible')).toHaveCSS('opacity', '1');
  await expect(page.getByText('正在加载高清图…')).toHaveCount(0);
  const box = await page.locator('.source-box').boundingBox();
  const image = await canvas.boundingBox();
  expect((box!.x - image!.x) / image!.width).toBeCloseTo(0.1, 2);
  expect((box!.y - image!.y) / image!.height).toBeCloseTo(0.2, 2);
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('img', { name: '教材第 2 页原图' })).toHaveCSS('opacity', '1');
  await expect(page.locator('.page-image-detail:visible')).toHaveCount(0);
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await expect(page.getByRole('img', { name: '教材第 1 页原图' })).toBeVisible();
  await expect(page.locator('.page-image-detail:visible')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('preview-loaded.png'), fullPage: true });
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Preview failure falls back to PNG; image errors retry in place and do not leak across pages', async ({
  page,
}) => {
  let originalAttempts = 0,
    detailAttempts = 0;
  await page.route('**/pages/1/image?variant=preview', (route) => route.abort());
  await page.route(/\/pages\/1\/image$/, (route) =>
    ++originalAttempts === 1 ? route.abort() : route.continue(),
  );
  await page.route('**/pages/1/image?variant=detail', (route) =>
    ++detailAttempts === 1 ? route.abort() : route.continue(),
  );
  const id = await openBook(page);
  await expect(page.getByText('页图加载失败')).toBeVisible();
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  const preview = page.getByRole('img', { name: '教材第 1 页原图' });
  await expect(preview).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(page.getByText('高清图加载失败')).toBeVisible();
  await expect(preview).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.page-image-detail:visible')).toHaveCSS('opacity', '1');
  expect(originalAttempts).toBe(2);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.page-image:visible')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('页图加载失败')).toHaveCount(0);
  await expect(page.getByText('高清图加载失败')).toHaveCount(0);
  await page.request.delete(`/api/workspaces/${id}`);
});
