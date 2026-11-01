import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-5/';

async function openFigure(page: Page, id: string) {
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

/** screen position of grid point (i, j) on a CircuitLab board (cols × rows, no profile strip) */
async function gridMapper(fig: Locator, cols: number, rows: number) {
  const box = (await fig.locator('canvas').boundingBox())!;
  const c = Math.min(box.width / (cols - 1 + 1.3), box.height / (rows - 1 + 1.3));
  const ox = box.x + (box.width - (cols - 1) * c) / 2;
  const oy = box.y + 0.65 * c + (box.height - (rows - 1 + 1.3) * c) / 2;
  return (i: number, j: number) => [ox + i * c, oy + j * c] as const;
}

async function dragThrough(page: Page, fig: Locator, cols: number, rows: number, pts: [number, number][]) {
  const at = await gridMapper(fig, cols, rows);
  await page.mouse.move(...at(...pts[0]));
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...at(...p), { steps: 6 });
  await page.mouse.up();
}

/** tap the middle of the grid edge a–b */
async function tapEdge(page: Page, fig: Locator, cols: number, rows: number, a: [number, number], b: [number, number]) {
  const at = await gridMapper(fig, cols, rows);
  await page.mouse.click(...at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
}

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    await page.waitForTimeout(400);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
  });

  test('every figure draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(2);
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('shorting a series bulb, adding a parallel one, and growing the mixed circuit', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-5a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('L₁: V = 6 V, I = 1 A, P = 6 W');
    await fig.getByRole('button', { name: 'סגרו את S' }).click();
    await expect(readout).toContainText('L₁: V = 12 V, I = 2 A, P = 24 W');
    await expect(readout).toContainText('L₂: V = 0 V, I = 0 A, P = 0 W');
    await fig.getByRole('button', { name: 'במקביל' }).click();
    await expect(readout).toContainText('L₁: V = 12 V, I = 2 A, P = 24 W');
    await fig.getByRole('button', { name: 'סגרו את S' }).click();
    await expect(readout).toContainText('L₁: V = 12 V, I = 2 A, P = 24 W');
    await expect(readout).toContainText('I = 4 A');
    await fig.getByRole('button', { name: 'מעורב' }).click();
    await fig.getByRole('button', { name: 'סגרו את S' }).click();
    await expect(readout).toContainText('L₁: V = 8 V, I = 1.33 A, P = 10.7 W');
    await expect(readout).toContainText('L₂: V = 4 V, I = 0.667 A, P = 2.67 W');
    const tasks = (await progress(page)).tasks;
    for (const t of ['short-L2', 'add-parallel', 'mixed-add']) expect(tasks[`fig-3-5a:${t}`]).toBeTruthy();
  });

  test('the builder recognises two bulbs in series, then two in parallel', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-5b');
    const readout = fig.locator('.sim-readout');
    // the battery sits on (0,3)→(0,2). Series: two bulbs along row 1, back down the right side
    await fig.getByRole('button', { name: 'תיל', exact: true }).click();
    await dragThrough(page, fig, 6, 4, [[0, 2], [0, 1], [1, 1]]);
    await dragThrough(page, fig, 6, 4, [[3, 1], [4, 1], [4, 2], [4, 3], [3, 3], [2, 3], [1, 3], [0, 3]]);
    await fig.getByRole('button', { name: 'נורה', exact: true }).click();
    await tapEdge(page, fig, 6, 4, [1, 1], [2, 1]);
    await tapEdge(page, fig, 6, 4, [2, 1], [3, 1]);
    await expect(readout).toContainText('V = 6 V, I = 1 A');
    expect((await progress(page)).tasks['fig-3-5b:build-series']).toBeTruthy();
    // parallel: two branches, each from the top rail down to the bottom rail
    await fig.getByRole('button', { name: 'נקו את הלוח' }).click();
    await fig.getByRole('button', { name: 'תיל', exact: true }).click();
    await dragThrough(page, fig, 6, 4, [[0, 2], [0, 1], [1, 1], [2, 1], [3, 1]]);
    await dragThrough(page, fig, 6, 4, [[0, 3], [1, 3], [2, 3], [3, 3]]);
    await dragThrough(page, fig, 6, 4, [[1, 2], [1, 3]]);
    await dragThrough(page, fig, 6, 4, [[3, 2], [3, 3]]);
    await fig.getByRole('button', { name: 'נורה', exact: true }).click();
    await tapEdge(page, fig, 6, 4, [1, 1], [1, 2]);
    await tapEdge(page, fig, 6, 4, [3, 1], [3, 2]);
    await expect(readout).toContainText('V = 12 V, I = 2 A');
    expect((await progress(page)).tasks['fig-3-5b:build-parallel']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-5"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'היא תאיר בדיוק כמו קודם' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: adding parallel resistances is caught as that misconception, then 2.4 Ω passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.5-parallel-r"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('10');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.5-parallel-r', correct: false, misconception: 'MC-parallel-r-adds', lesson: '3.5' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2.4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the shorted bulb changes nothing" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.5-short-bulb"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'שלושתן ממשיכות להאיר כמו קודם' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.5-short-bulb', correct: false, confident: true, misconception: 'MC-shorted-bulb-unchanged' });
  });
});
