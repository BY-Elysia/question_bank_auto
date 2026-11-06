import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

async function seed(page: Page) {
  const buffer = await sharp({
    create: { width: 100, height: 140, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const response = await page.request.post('/api/workspaces/images?title=加载回归', {
    multipart: { images: { name: 'page.png', mimeType: 'image/png', buffer } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return { id, view: await (await page.request.get(`/api/workspaces/${id}`)).json() };
}

test('Login and configuration do not download review code, math styles or fonts', async ({
  page,
}) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.route('**/api/access/session', (route) =>
    route.fulfill({ json: { enabled: true, authenticated: false } }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '登录教材工作台' })).toBeVisible();
  expect(urls.some((url) => /\/assets\/(App|Workspace|Review)-|KaTeX/.test(url))).toBe(false);
  expect(urls.some((url) => /\/api\/(workspaces|health)/.test(url))).toBe(false);
  await page.unroute('**/api/access/session');
  const { id } = await seed(page);
  await page.goto(`/#/workspace/${id}`);
  await page.reload();
  await expect(page.getByLabel('学科')).toBeVisible();
  expect(urls.some((url) => /\/assets\/Review-|KaTeX/.test(url))).toBe(false);
  expect(urls.some((url) => url.includes('/image'))).toBe(false);
  await page.getByLabel('学科').fill('数学');
  await page.getByRole('button', { name: '开始提取', exact: true }).click();
  await expect(page.locator('.katex').first()).toBeVisible();
  expect(urls.some((url) => /\/assets\/Review-.*\.css/.test(url))).toBe(true);
  await expect(page.locator('.content-body > p')).toHaveCount(0);
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Polling slows when idle, stays fast for active work, pauses hidden/offline, and resumes once', async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('textbook-effects', 'off'));
  const { id, view } = await seed(page);
  let reads = 0,
    active = false;
  await page.route(`**/api/workspaces/${id}*`, async (route) => {
    reads++;
    await route.fulfill({
      json: {
        ...view,
        workspace: {
          ...view.workspace,
          title: `read-${reads}`,
          status: active ? 'extracting' : 'ready',
        },
      },
    });
  });
  await page.goto(`/#/workspace/${id}`);
  await expect(page.getByRole('heading', { name: 'read-1', exact: true })).toBeVisible();
  await page.clock.runFor(29000);
  expect(reads).toBe(1);
  active = true;
  await page.clock.runFor(1000);
  await expect(page.getByRole('heading', { name: 'read-2', exact: true })).toBeVisible();
  await page.clock.runFor(2000);
  await expect(page.getByRole('heading', { name: 'read-3', exact: true })).toBeVisible();
  active = false;
  await page.clock.runFor(2000);
  await expect(page.getByRole('heading', { name: 'read-4', exact: true })).toBeVisible();
  await page.clock.runFor(10000);
  expect(reads).toBe(4);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(120000);
  expect(reads).toBe(4);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.getByRole('heading', { name: 'read-5', exact: true })).toBeVisible();
  await page.clock.runFor(1000);
  expect(reads).toBe(5);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await page.clock.runFor(120000);
  expect(reads).toBe(5);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.getByRole('heading', { name: 'read-6', exact: true })).toBeVisible();
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Failed polling backs off and returns to the idle interval after recovery', async ({
  page,
}) => {
  await page.clock.install();
  const { id, view } = await seed(page);
  let reads = 0;
  await page.route(`**/api/workspaces/${id}*`, (route) => {
    reads++;
    return reads < 4
      ? route.fulfill({ status: 503, json: { detail: `暂时失败-${reads}` } })
      : route.fulfill({ json: view });
  });
  await page.goto(`/#/workspace/${id}`);
  await expect(page.getByRole('alert')).toContainText('暂时失败-1');
  await page.clock.runFor(1000);
  expect(reads).toBe(1);
  await page.clock.runFor(1600);
  await expect(page.getByRole('alert')).toContainText('暂时失败-2');
  await page.clock.runFor(2500);
  expect(reads).toBe(2);
  await page.clock.runFor(1600);
  await expect(page.getByRole('alert')).toContainText('暂时失败-3');
  await page.clock.runFor(8500);
  await expect(page.getByLabel('学科')).toBeVisible();
  await page.clock.runFor(15000);
  expect(reads).toBe(4);
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Repeated refresh clicks coalesce behind a pending request and discard its stale result', async ({
  page,
}) => {
  const { id, view } = await seed(page);
  let reads = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/workspaces/${id}*`, async (route) => {
    reads++;
    if (reads === 1) return route.fulfill({ status: 503, json: { detail: '暂时不可用' } });
    if (reads === 2) {
      await gate;
      return route.fulfill({ json: { ...view, workspace: { ...view.workspace, title: 'stale' } } });
    }
    await route.fulfill({ json: { ...view, workspace: { ...view.workspace, title: 'fresh' } } });
  });
  await page.goto(`/#/workspace/${id}`);
  await expect(page.getByRole('alert')).toContainText('暂时不可用');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  expect(reads).toBe(2);
  release();
  await expect(page.getByRole('heading', { name: 'fresh', exact: true })).toBeVisible();
  expect(reads).toBe(3);
  await page.request.delete(`/api/workspaces/${id}`);
});

test('Chapter preview data is requested only while the extraction preview is open', async ({
  page,
}) => {
  const { id, view } = await seed(page);
  const modes: string[] = [];
  await page.route(`**/api/workspaces/${id}*`, async (route) => {
    const mode = new URL(route.request().url()).searchParams.get('preview') ?? 'include';
    modes.push(mode);
    await route.fulfill({
      json: {
        ...view,
        workspace: { ...view.workspace, status: 'interrupted' },
        actions: { ...view.actions, resume: true, configure: false },
        chapters: [
          {
            id: 'chapter_1',
            pages: [1],
            status: 'interrupted',
            title: '测试章节',
            processedPages: 1,
            preview:
              mode === 'omit'
                ? null
                : {
                    ...view.document,
                    contents: [
                      {
                        id: 'preview-content',
                        kind: 'paragraph',
                        sectionId: null,
                        text: '阶段预览内容',
                        question: null,
                        table: null,
                        caption: null,
                        sources: [{ page: 1, box: [0.1, 0.2, 0.9, 0.6] }],
                      },
                    ],
                  },
          },
        ],
      },
    });
  });
  await page.goto(`/#/workspace/${id}`);
  await expect(page.getByRole('button', { name: '查看已提取内容预览' })).toBeVisible();
  expect(modes).toEqual(['omit']);
  await page.getByRole('button', { name: '查看已提取内容预览' }).click();
  await expect(page.getByText('阶段预览内容', { exact: true })).toBeVisible();
  expect(modes).toEqual(['omit', 'include']);
  await page.getByRole('button', { name: '收起已提取内容预览' }).click();
  await expect.poll(() => modes.at(-1)).toBe('omit');
  await expect(page.getByText('阶段预览内容', { exact: true })).toHaveCount(0);
  await page.request.delete(`/api/workspaces/${id}`);
});
