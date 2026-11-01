import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-4/';

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

  test('doubling the voltage on a fixed bulb quadruples its power; less resistance at the same voltage takes more', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-4a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('L₁: V = 6 V, I = 1 A, P = 6 W');
    await expect(readout).toContainText('V₁: מראה 6 V');
    const [emf, R] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
    // every value a drag passes, as a real slider fires them
    for (const v of [7.5, 9, 10.5, 12]) await setSlider(emf, v);
    await expect(readout).toContainText('L₁: V = 12 V, I = 2 A, P = 24 W');
    await setSlider(R, 4);
    await expect(readout).toContainText('L₁: V = 12 V, I = 3 A, P = 36 W');
    const tasks = (await progress(page)).tasks;
    for (const t of ['double-emf', 'lower-R']) expect(tasks[`fig-3-4a:${t}`]).toBeTruthy();
  });

  test('side by side on one voltage, the 6 Ω bulb takes 24 W and the 12 Ω bulb 12 W', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-4b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('L₁: V = 12 V, I = 2 A, P = 24 W');
    await expect(readout).toContainText('L₂: V = 12 V, I = 1 A, P = 12 W');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-4"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'וההתנגדות שלה קטנה יותר' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: "half the voltage, half the power" is caught as that misconception, then 25 W passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.4-half-voltage"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('50');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.4-half-voltage', correct: false, misconception: 'MC-power-proportional-v', lesson: '3.4' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('25');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "a kilowatt-hour is power" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.4-kwh"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('input[type=text]').fill('1.25');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.4-kwh', correct: false, confident: true, misconception: 'MC-kwh-is-power' });
  });
});
