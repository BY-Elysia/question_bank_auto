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
      kind: 'question',
      sectionId: null,
      text: `教材第 ${p.number} 页内容`,
      question: {
        label: String(p.number),
        type: 'calculation',
        prompt: '题干',
        options: [],
        answer: null,
        children: [],
      },
      table: null,
      caption: null,
      sources: [{ page: p.number, box: [0.1, 0.2, 0.9, 0.6] }],
    }));
    await route.fulfill({ json: view });
  });
  await page.goto(`/#/workspace/${id}`);
  return id;
}

test('Normal page images preload only the next page and never request detail, including after zoom', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/image')) requests.push(r.url());
  });
  await page.route('**/pages/1/image?variant=preview', async (route) => {
    await gate;
    await route.continue();
  });
  const id = await openBook(page);
  await expect(page.getByText('正在加载页图…')).toBeVisible();
  const canvas = page.locator('.page-image:visible');
  const before = await canvas.boundingBox();
  expect(before!.height / before!.width).toBeCloseTo(1.5, 2);
  expect(requests.some((u) => u.includes('/2/image'))).toBe(false);
  release();
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.source-box')).toHaveCount(1);
  await expect.poll(() => requests.some((u) => u.includes('/2/image?variant=preview'))).toBe(true);
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(page.getByRole('img', { name: '教材第 1 页原图' })).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('img', { name: '教材第 2 页原图' })).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await expect(page.getByRole('img', { name: '教材第 1 页原图' })).toBeVisible();
  expect(requests.some((u) => u.includes('variant=detail'))).toBe(false);
  await expect(page.getByText('正在加载高清图…')).toHaveCount(0);
  await page.request.delete(`/api/workspaces/${id}`);
});
test('Normal image failure retries in place and does not leak across pages', async ({ page }) => {
  let attempts = 0;
  await page.route('**/pages/1/image?variant=preview', (route) => route.abort());
  await page.route(/\/pages\/1\/image$/, (route) =>
    ++attempts === 1 ? route.abort() : route.continue(),
  );
  const id = await openBook(page);
  await expect(page.getByText('页图加载失败')).toBeVisible();
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.getByRole('img', { name: '教材第 1 页原图' })).toHaveCSS('opacity', '1');
  expect(attempts).toBe(2);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.page-image:visible')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('页图加载失败')).toHaveCount(0);
  await page.request.delete(`/api/workspaces/${id}`);
});
