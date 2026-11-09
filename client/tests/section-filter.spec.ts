import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const fixtures = JSON.parse(
  await readFile(new URL('./fixtures/textbook-math.json', import.meta.url), 'utf8'),
);

test('Section selection scopes questions, includes descendants, preserves cross-page content and supports source navigation', async ({
  page,
}) => {
  const buffer = await sharp({
    create: { width: 600, height: 800, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  for (const name of ['1.png', '2.png'])
    form.append('images', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), name);
  const response = await page.request.post('/api/workspaces/images?title=小节筛选回归', {
    multipart: form,
  });
  expect(response.status()).toBe(201);
  const workspace = await response.json();
  const template = fixtures.find((c: any) => c.question);
  await page.route(`**/api/workspaces/${workspace.id}*`, async (route) => {
    const original = await route.fetch(),
      view = await original.json();
    view.workspace.status = 'needs_review';
    view.revision = 1;
    view.nextStep = 'review';
    view.actions = { ...view.actions, configure: false, review: true };
    view.document.sections = [
      {
        id: 'chapter',
        parentId: null,
        title: '第一章',
        level: 1,
        source: { page: 1, box: [0, 0, 1, 0.1] },
      },
      {
        id: 'a',
        parentId: 'chapter',
        title: '第一节 极限',
        level: 2,
        source: { page: 1, box: [0, 0.1, 1, 0.2] },
      },
      {
        id: 'child',
        parentId: 'a',
        title: '例题',
        level: 3,
        source: { page: 1, box: [0, 0.2, 1, 0.3] },
      },
      {
        id: 'b',
        parentId: 'chapter',
        title: '第二节 导数',
        level: 2,
        source: { page: 1, box: [0, 0.3, 1, 0.4] },
      },
    ];
    view.document.contents = ['a', 'child', 'b'].map((sectionId, i) => ({
      ...structuredClone(template),
      id: `q${i}`,
      sectionId,
      sources: [{ page: 1, box: [0.1, 0.1 + i * 0.2, 0.9, 0.2 + i * 0.2] }],
      question: {
        ...structuredClone(template.question),
        label: String(i + 1),
        prompt: `${sectionId}题干 $x^2$`,
        children: [],
        answer: null,
      },
    }));
    view.document.contents[0].sources.push({ page: 2, box: [0.1, 0.1, 0.9, 0.3] });
    view.document.contents[2].sources.push({ page: 2, box: [0.1, 0.4, 0.9, 0.6] });
    await route.fulfill({ json: view });
  });
  try {
    await page.goto('/#/workspace/' + workspace.id);
    const tree = page.locator('.chapter-tree'),
      cards = page.locator('.content-card');
    await expect(cards).toHaveCount(3);
    await tree.getByRole('button', { name: '第一节 极限' }).click();
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#content-q2')).toHaveCount(0);
    await expect(tree.getByRole('button', { name: '第一节 极限' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByLabel('搜索完整题目').fill('a题干');
    await expect(cards).toHaveCount(1);
    await tree.getByRole('button', { name: '第二节 导数' }).click();
    await expect(page.getByLabel('搜索完整题目')).toHaveValue('');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('b题干');
    await tree.getByRole('button', { name: '第一节 极限' }).click();
    await page.getByRole('button', { name: '查看题目 1 第 2 页原图' }).click();
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#content-q0')).toBeVisible();
    await page.locator('.image-scroll > div:not([hidden]) .source-box').last().click();
    await expect(cards).toHaveCount(1);
    await expect(page.locator('#content-q2')).toBeVisible();
    await expect(tree.getByRole('button', { name: '第二节 导数' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await tree.getByRole('button', { name: '第一章', exact: false }).click();
    await expect(cards).toHaveCount(3);
    await tree.locator('.tree-summary').click();
    await expect(cards).toHaveCount(3);
  } finally {
    await page.request.delete('/api/workspaces/' + workspace.id);
  }
});
