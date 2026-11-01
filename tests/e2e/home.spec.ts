import { expect, test, type Page } from '@playwright/test';

const charges = (page: Page) =>
  page.locator('canvas.book-canvas').evaluate((el: HTMLCanvasElement) => JSON.parse(el.dataset.charges ?? 'null') as [number, number, number][] | null);

test.describe('the pop-up book on the cover', () => {
  test('the 3D book loads lazily, and its board is a live figure', async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    const fig = page.locator('figure.book3d');
    // WebGL is available in the test browser: the book replaces the 2D drawing
    await expect(fig.locator('canvas')).toHaveAttribute('data-view', '3d');
    await expect(fig).toHaveClass(/ready/);
    expect(await charges(page)).toEqual([
      [-38, 0, 1],
      [38, 0, -1],
    ]);
    // the handles appear once the board has risen from the page
    const first = fig.locator('.book-handle').first();
    await expect(first).toBeVisible();

    if (!isMobile) {
      const box = (await first.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y - 40, { steps: 6 });
      await page.mouse.up();
      const [[x, y]] = (await charges(page))!;
      // dragged right and up on the board (physics space: y up)
      expect(x).toBeGreaterThan(-38);
      expect(y).toBeGreaterThan(0);
    }

    await fig.getByRole('button', { name: 'מטענים זהים' }).click();
    expect((await charges(page))!.map((c) => c[2])).toEqual([1, 1]);
    const second = fig.locator('.book-handle').nth(1);
    await second.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect((await charges(page))![1].slice(0, 2)).toEqual([48, 0]);
    await expect(fig.locator('[aria-live]')).toContainText('מטען חיובי ומטען חיובי');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('still mode keeps the 2D drawing', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('emlab:settings', JSON.stringify({ still: true, theme: 'auto' })));
    await page.goto('/');
    const fig = page.locator('figure.book3d');
    await expect(fig.locator('.book-fallback svg.cover-art')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(fig.locator('canvas')).toHaveCount(0);
  });

  test('without WebGL the cover keeps the 2D drawing', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof orig;
    });
    await page.goto('/');
    const fig = page.locator('figure.book3d');
    await expect(fig.locator('.book-fallback svg.cover-art')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(fig.locator('canvas')).toHaveCount(0);
  });
});
