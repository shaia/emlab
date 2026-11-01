import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-9/';

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

  test('charging reaches 63% at τ and nearly full by 5τ; discharging reverses the current', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-9a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('τ = RC = 1 s');
    await fig.getByRole('button', { name: 'מתג לטעינה (עם הסוללה)' }).click();
    const time = fig.locator('input[type=range]').first();
    await setSlider(time, 0);
    await expect(readout).toContainText('I = 1.2 mA');
    await setSlider(time, 1);
    await expect(readout).toContainText('V = 7.59 V');
    await setSlider(time, 5);
    await expect(readout).toContainText('V = 11.9 V');
    await fig.getByRole('button', { name: 'מתג לפריקה (בלי הסוללה)' }).click();
    await setSlider(time, 0);
    await expect(readout).toContainText('(בכיוון ההפוך לטעינה)');
    await setSlider(time, 1);
    await expect(readout).toContainText('V = 4.38 V');
    await setSlider(fig.locator('input[type=range]').nth(1), 20);
    await expect(readout).toContainText('τ = RC = 2 s');
    const tasks = (await progress(page)).tasks;
    for (const t of ['charge-full', 'discharge', 'change-tau']) expect(tasks[`fig-3-9a:${t}`]).toBeTruthy();
  });

  test('in the steady state the capacitor branch carries no current and holds 800 μC', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-9b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('C₁: V = 8 V, I = 0 A, Q = 800 μC');
    await fig.getByRole('button', { name: 'קבל בטור' }).click();
    await expect(readout).toContainText('C₁: V = 12 V, I = 0 A, Q = 1200 μC');
    await expect(readout).toContainText('R₁: V = 0 V, I = 0 A');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-9"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'הוא מתחיל גדול' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: "full after one τ" is caught as that misconception, then 6.32 V passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.9-after-tau"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('10');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.9-after-tau', correct: false, misconception: 'MC-full-after-tau', lesson: '3.9' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('6.32');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the capacitor fills at once" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.9-start-end"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'הקבל מתמלא ברגע הסגירה' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.9-start-end', correct: false, confident: true, misconception: 'MC-capacitor-instant' });
  });
});
