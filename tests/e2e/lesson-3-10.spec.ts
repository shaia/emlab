import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-10/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page, id: string) {
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
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
    expect(await canvases.count()).toBe(2);
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('the rheostat sweeps the battery from near its EMF down to the short circuit', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-10a');
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('V₁: מראה 3.6 V');
    await expect(readout).toContainText('A₁: מראה 0.6 A');
    const slider = fig.locator('input[type=range]').first();
    for (const v of [12, 18, 24]) await setSlider(slider, v);
    await expect(readout).toContainText('V₁: מראה 4.24 V');
    for (const v of [12, 6, 0]) await setSlider(slider, v);
    await expect(readout).toContainText('V₁: מראה 0 V');
    await expect(readout).toContainText('A₁: מראה 3 A');
    const tasks = (await progress(page)).tasks;
    for (const t of ['rheo-max', 'rheo-min']) expect(tasks[`fig-3-10a:${t}`]).toBeTruthy();
  });

  test('a ruler laid along the battery data reads ε ≈ 4.5 V at the axis and a slope of −r', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-10b');
    const readout = fig.locator('.sim-readout');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // axes run to 1.5 A and 5 V; the best line is V ≈ 4.48 V − 1.49 Ω·I.
    // Handle 1 from (0.12, 0.30) to (0.12, 0.84) of the plot, handle 2 from (0.88, 0.62) to (0.88, 0.50).
    for (let i = 0; i < 10; i++) await canvas.press('Shift+ArrowUp');
    for (let i = 0; i < 4; i++) await canvas.press('ArrowUp');
    await canvas.press(' ');
    for (let i = 0; i < 2; i++) await canvas.press('Shift+ArrowDown');
    for (let i = 0; i < 2; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('-1.49');
    await expect(readout).toContainText('4.47 V');
    expect((await progress(page)).tasks['fig-3-10b:ruler-slope']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-10"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'קו ישר שיורד' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: reading the first point as the EMF is caught, then 6 V passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.10-emf-from-line"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.10-emf-from-line', correct: false, misconception: 'MC-terminal-equals-emf', lesson: '3.10' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the battery line passes through the origin" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.10-through-origin"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'אין בעיה' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.10-through-origin', correct: false, confident: true, misconception: 'MC-battery-line-origin' });
  });
});
