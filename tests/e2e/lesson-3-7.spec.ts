import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-7/';

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
    expect(await canvases.count()).toBe(2);
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('a voltmeter in line starves the bulb; an ammeter across it shorts it; a stiff voltmeter reads true', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-7a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('V₁: מראה 11.8 V');
    await fig.getByRole('button', { name: 'מד מתח בטור' }).click();
    await expect(readout).toContainText('V₁: מראה 12 V');
    await fig.getByRole('button', { name: 'מד זרם במקביל' }).click();
    await expect(readout).toContainText('A₁: מראה 19.7 A');
    await fig.getByRole('button', { name: 'מד מתח על מחלק מתח' }).click();
    await expect(readout).toContainText('V₁: מראה 4 V');
    const slider = fig.locator('input[type=range]').first();
    for (const v of [4.5, 5, 5.5, 6]) await setSlider(slider, v);
    await expect(readout).toContainText('V₁: מראה 5.97 V');
    const tasks = (await progress(page)).tasks;
    for (const t of ['v-series', 'a-parallel', 'meter-1M']) expect(tasks[`fig-3-7a:${t}`]).toBeTruthy();
  });

  test('the rheostat dims the bulb as it grows, and gives the full voltage at zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-7b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('L₁: V = 6 V, I = 1 A, P = 6 W');
    const slider = fig.locator('input[type=range]').first();
    for (const v of [9, 12, 15, 18]) await setSlider(slider, v);
    await expect(readout).toContainText('L₁: V = 3 V, I = 0.5 A, P = 1.5 W');
    for (const v of [12, 6, 0]) await setSlider(slider, v);
    await expect(readout).toContainText('L₁: V = 12 V, I = 2 A, P = 24 W');
    const tasks = (await progress(page)).tasks;
    for (const t of ['dim', 'full']) expect(tasks[`fig-3-7b:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-7"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'הנורה כמעט תכבה' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: "meters never disturb" is caught as that misconception, then 3 V passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.7-loading"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('4.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.7-loading', correct: false, misconception: 'MC-meters-never-disturb', lesson: '3.7' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "more rheostat, brighter bulb" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.7-rheostat-up"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'כי יש יותר התנגדות במעגל' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.7-rheostat-up', correct: false, confident: true, misconception: 'MC-rheostat-up-brighter' });
  });
});
