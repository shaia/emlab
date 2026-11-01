import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-1/';

/** press keys on a figure's canvas: '1'/'2' pick a probe lead, arrows move it to the next point a part touches */
const keys = async (fig: Locator, ...ks: string[]) => {
  const canvas = fig.locator('canvas');
  await canvas.focus();
  for (const k of ks) await canvas.press(k);
};

/** drag the mouse through grid points of a CircuitLab board (cols × rows, no profile strip) */
async function dragThrough(page: Page, fig: Locator, cols: number, rows: number, pts: [number, number][]) {
  const box = (await fig.locator('canvas').boundingBox())!;
  // CircuitLab's geometry(): on a narrow stage a band of 34 px on top stays clear of the tool buttons
  const top = box.width < 520 ? 34 : 0;
  const c = Math.min(box.width / (cols - 1 + 1.3), (box.height - top) / (rows - 1 + 1.3));
  const ox = box.x + (box.width - (cols - 1) * c) / 2;
  const oy = box.y + top + 0.65 * c + (box.height - top - (rows - 1 + 1.3) * c) / 2;
  const at = ([i, j]: [number, number]) => [ox + i * c, oy + j * c] as const;
  await page.mouse.move(...at(pts[0]));
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...at(p), { steps: 6 });
  await page.mouse.up();
}

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
    expect(await canvases.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('the whole EMF sits across an open switch; closed, it sits across the bulb', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-1a');
    const readout = fig.locator('.sim-readout');
    // the leads start on the battery's terminals
    await expect(readout).toContainText('12 V');
    // red to the left side of the switch, along the + wire: one wire, one potential
    await keys(fig, '1', 'ArrowUp', 'ArrowRight');
    await expect(readout.locator('b.q').first()).toHaveText('12 V');
    await keys(fig, '2', 'ArrowUp', 'ArrowUp');
    await expect(readout.locator('b.q').first()).toHaveText('0 V');
    // black back down, then to the right side of the switch
    await keys(fig, 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowUp');
    await expect(readout.locator('b.q').first()).toHaveText('12 V');
    await fig.getByRole('button', { name: 'סגרו את S' }).click();
    await expect(readout.locator('b.q').first()).toHaveText('0 V');
    // across the bulb
    await keys(fig, '1', 'ArrowRight', 'ArrowRight', 'ArrowDown');
    await keys(fig, '2', 'ArrowRight', 'ArrowDown', 'ArrowDown');
    await expect(readout.locator('b.q').first()).toHaveText('12 V');
    const tasks = (await progress(page)).tasks;
    for (const t of ['probe-wire', 'probe-open', 'probe-bulb']) expect(tasks[`fig-3-1a:${t}`]).toBeTruthy();
  });

  test('one wire leaves the bulb dark; a closed loop lights it', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-1c');
    await fig.getByRole('button', { name: 'תיל', exact: true }).click();
    await dragThrough(page, fig, 5, 3, [[0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [3, 1]]);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('L₁: V = 0 V');
    expect((await progress(page)).tasks['fig-3-1c:light']).toBeFalsy();
    await dragThrough(page, fig, 5, 3, [[3, 2], [2, 2], [1, 2], [0, 2]]);
    await expect(readout).toContainText('L₁: V = 12 V');
    expect((await progress(page)).tasks['fig-3-1c:light']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-1"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'שנים-עשר וולט' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: "no current, no voltage" across an open switch is caught as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.1-open-switch-voltage"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.1-open-switch-voltage', correct: false, misconception: 'MC-no-current-no-voltage', lesson: '3.1' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('9');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the voltage keeps falling along the wire" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.1-wire-voltage"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'חלק ניכר' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.1-wire-voltage', correct: false, confident: true, misconception: 'MC-wire-potential-drops' });
  });
});
