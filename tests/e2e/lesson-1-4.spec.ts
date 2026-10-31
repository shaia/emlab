import { expect, test, type Page } from '@playwright/test';

const LESSON = '/lessons/1-4/';

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));
const text = async (loc: ReturnType<Page['locator']>) => (await loc.innerText()).replace(/\s+/g, ' ');

/** Islands hydrate when visible: input sent before that is lost. The canvas is drawn only after hydration. */
const hydrated = (fig: ReturnType<Page['locator']>) =>
  expect
    .poll(() =>
      fig.locator('canvas').evaluate((el: HTMLCanvasElement) => {
        const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
        for (let k = 3; k < d.length; k += 4 * 5) if (d[k] > 0) return true;
        return false;
      }),
    )
    .toBe(true);

test.describe('live figures', () => {
  test('every simulation draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    const n = await canvases.count();
    expect(n).toBe(2);
    for (let i = 0; i < n; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect
        .poll(() =>
          c.evaluate((el: HTMLCanvasElement) => {
            const ctx = el.getContext('2d')!;
            const d = ctx.getImageData(0, 0, el.width, el.height).data;
            let inked = 0;
            for (let k = 3; k < d.length; k += 4 * 7) if (d[k] > 0) inked++;
            return inked;
          }),
        )
        .toBeGreaterThan(200);
    }
  });

  test('on a line the forces subtract: 0.0893 N and 0.0298 N give 0.0595 N', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-4a');
    await fig.scrollIntoViewIfNeeded();
    await hydrated(fig);
    await page.waitForTimeout(800); // a step may re-apply its preset once the figure is in view
    const t = await text(fig.locator('.sim-readout'));
    expect(t).toContain('F = 0.0595 N');
    expect(t).toContain('FA = 0.0893 N');
    expect(t).toContain('FC = 0.0298 N');
  });

  test('moving C changes F_C but not F_A (superposition)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse drag checked on desktop');
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-4a');
    await fig.scrollIntoViewIfNeeded();
    await hydrated(fig);
    await page.waitForTimeout(800); // a step may re-apply its preset once the figure is in view
    const readout = fig.locator('.sim-readout');
    const read = async () => {
      const t = await text(readout);
      return { A: t.match(/FA = (\S+) N/)?.[1], C: t.match(/FC = (\S+) N/)?.[1] };
    };
    const before = await read();
    const box = (await fig.locator('canvas').boundingBox())!;
    const ppm = box.width / 2;
    const at = (wx: number, wy: number) => [box.x + box.width / 2 + wx * ppm, box.y + box.height / 2 - wy * ppm];
    const [sx, sy] = at(0.55, 0);
    const [ex, ey] = at(0.9, 0.3);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await read()).C).not.toBe(before.C);
    expect((await read()).A).toBe(before.A);
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
  });

  test('B can be dragged to the point where the net force vanishes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse drag checked on desktop');
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-4a');
    await fig.scrollIntoViewIfNeeded();
    await hydrated(fig);
    await page.waitForTimeout(800); // a step may re-apply its preset once the figure is in view
    const box = (await fig.locator('canvas').boundingBox())!;
    const ppm = box.width / 2;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 0.147 * ppm, cy, { steps: 8 });
    await page.mouse.up();
    await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-4a:cancel']).toBeTruthy();
  });

  test('right-angle preset: the sum is 0.188 N with components 0.113 and -0.15, and the toggles tick the tasks', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-4b');
    await fig.scrollIntoViewIfNeeded();
    await hydrated(fig);
    await page.waitForTimeout(800); // a step may re-apply its preset once the figure is in view
    await expect(async () => {
      await fig.getByRole('button', { name: 'משולש ישר-זווית' }).click();
      const t = await text(fig.locator('.sim-readout'));
      expect(t).toContain('F = 0.188 N');
      expect(t).toContain('Fx = 0.113 N');
      expect(t).toContain('Fy = -0.15 N');
    }).toPass({ timeout: 10_000 });
    await fig.getByRole('button', { name: 'חיבור ראש-לזנב' }).click();
    await fig.getByRole('button', { name: 'רכיבים x ו-y' }).click();
    await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/);
    await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing, and the summary closes the loop', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-4"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').nth(1).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-4'].choice).toBe('1');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });
});

test.describe('questions', () => {
  test('numeric: adding the magnitudes is caught, then the vector sum passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.4-line-subtract"]');
    await q.scrollIntoViewIfNeeded();
    const input = q.locator('input[type=text]');
    await expect(async () => {
      await input.fill('2.1');
      await expect(q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true })).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('חיברתם');
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ misconception: 'MC-forces-add-as-numbers', lesson: '1.4' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.3');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident wrong answer about shielding is recorded as a misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.4-independence"]');
    await q.scrollIntoViewIfNeeded();
    await expect(async () => {
      await q.locator('label.q-choice', { hasText: 'חוסם' }).click();
      await expect(q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true })).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.4-independence', misconception: 'MC-superposition-shielding', lesson: '1.4' });
  });
});

test.describe('lesson completion', () => {
  test('finishing stamps the lesson and marks it in the contents', async ({ page }) => {
    await page.goto(LESSON);
    const end = page.getByRole('button', { name: /סיימתי את השיעור/ });
    await end.scrollIntoViewIfNeeded();
    await end.click();
    await expect(page.locator('.stamp')).toBeVisible();
    await page.goto('/');
    await expect(page.locator('[data-lesson-id="1.4"]')).toHaveClass(/completed/);
  });
});
