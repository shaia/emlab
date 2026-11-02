import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-10/';

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
  // a step may have driven the figure before the freeze: start from its own initial state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

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

  test('doubling the current doubles tanθ, not θ: 23° at 2 A, 40° at 4 A', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-10a');
    const readout = fig.locator('.sim-readout');
    const current = fig.locator('input[type=range]').nth(0);
    await setSlider(current, 2);
    await expect(readout).toContainText('θ = 23°');
    await expect(readout).toContainText('מערבה');
    await expect(readout).toContainText('B');
    await setSlider(current, 4);
    await expect(readout).toContainText('θ = 40°');
    // reversing the current turns the needle east by the same angle
    await fig.getByRole('button', { name: 'הפכו את כיוון הזרם' }).click();
    await expect(readout).toContainText('θ = 40°');
    await expect(readout).toContainText('מזרחה');
  });

  test('an east–west wire leaves the needle on north; a strong reversed current flips it', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-10a');
    const readout = fig.locator('.sim-readout');
    const sliders = fig.locator('input[type=range]');
    await setSlider(sliders.nth(0), 4);
    await setSlider(sliders.nth(2), 90);
    await expect(readout).toContainText('θ = 0°');
    expect((await progress(page)).tasks['fig-4-10a:wire-ew']).toBeTruthy();
    await fig.getByRole('button', { name: 'הפכו את כיוון הזרם' }).click();
    await expect(readout).toContainText('θ = 0°');
    await setSlider(sliders.nth(0), 6);
    await expect(readout).toContainText('θ = 180°');
  });

  test('the needle approaches 90° but stays short of it', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-10a');
    const readout = fig.locator('.sim-readout');
    const sliders = fig.locator('input[type=range]');
    await setSlider(sliders.nth(1), 1);
    await setSlider(sliders.nth(0), 10);
    await expect(readout).toContainText('θ = 81°');
    expect((await progress(page)).tasks['fig-4-10a:near-90']).toBeTruthy();
  });

  test('recording five currents fills the table and completes the task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-10a');
    const current = fig.locator('input[type=range]').nth(0);
    for (const I of [1, 2, 3, 4, 5]) {
      await setSlider(current, I);
      await fig.getByRole('button', { name: 'רשמו מדידה' }).click();
    }
    const rows = fig.locator('.cw-table tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(1)).toContainText('23');
    await expect(rows.nth(1)).toContainText('0.424');
    expect((await progress(page)).tasks['fig-4-10a:record-five']).toBeTruthy();
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test('a ruler laid along the compass data reads a slope of about 0.207 per ampere', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-10b');
    const readout = fig.locator('.sim-readout');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // axes run to 8 A and 1.5; the best line is tanθ ≈ 0.207·I.
    // Handle 1 from (0.12, 0.30) to (0.12, 0.13) of the plot, handle 2 from (0.88, 0.62) to (0.88, 0.97).
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowDown');
    for (let i = 0; i < 2; i++) await canvas.press('ArrowDown');
    await canvas.press(' ');
    for (let i = 0; i < 7; i++) await canvas.press('Shift+ArrowUp');
    await expect(readout).toContainText('0.207 1/A');
    expect((await progress(page)).tasks['fig-4-10b:ruler-slope']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-10"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'יותר מ-23 מעלות, אבל' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: doubling the angle is caught as that misconception, then 43° passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.10-double-current"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('50');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.10-double-current', correct: false, misconception: 'MC-compass-angle-proportional', lesson: '4.10' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('43');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the wire’s direction doesn’t matter" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.10-why-ns"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'זה לא באמת חשוב' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.10-why-ns', correct: false, confident: true, misconception: 'MC-compass-wire-orientation' });
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});
