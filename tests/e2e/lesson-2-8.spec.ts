import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-8/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

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

  test('parallel adds, series shares one charge, mixed reduces step by step', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-8a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    // a text step may have changed the figure before the freeze: start from its own state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    // 2 μF and 3 μF on 12 V
    await expect(readout).toContainText('Ceq = 5 μF');
    await expect(readout).toContainText('C₁: Q = 24 μC, V = 12 V');
    await setSlider(fig.locator('input[type=range]').nth(1), 4);
    await expect(readout).toContainText('Ceq = 6 μF');
    await setSlider(fig.locator('input[type=range]').nth(1), 3);
    await fig.getByRole('button', { name: 'בטור' }).click();
    await expect(readout).toContainText('Ceq = 1.2 μF');
    await expect(readout).toContainText('C₁: Q = 14.4 μC, V = 7.2 V');
    await expect(readout).toContainText('C₂: Q = 14.4 μC, V = 4.8 V');
    await setSlider(fig.locator('input[type=range]').first(), 3);
    await expect(readout).toContainText('Ceq = 1.5 μF');
    await setSlider(fig.locator('input[type=range]').first(), 2);
    await fig.getByRole('button', { name: 'מעורב' }).click();
    await expect(readout).toContainText('Ceq = 1.33 μF');
    await expect(readout).toContainText('C₁: Q = 16 μC, V = 8 V');
    await expect(readout).toContainText('C₃: Q = 4 μC, V = 4 V');
    const tasks = (await progress(page)).tasks;
    for (const t of ['parallel-sum', 'series-less', 'series-voltage', 'mixed']) expect(tasks[`fig-2-8a:${t}`]).toBeTruthy();
  });

  test('a charged capacitor switched onto an empty one keeps its charge and loses energy', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-8b');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    // a text step may have changed the figure before the freeze: start from its own state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    // scrolling here can bring the "after the switch" step to mid-screen: start again from a charged C₁
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await expect(readout).toContainText('C₁: Q = 24 μC, V = 12 V');
    await fig.getByRole('button', { name: 'העבירו את המתג ל-C₂' }).click();
    await expect(readout).toContainText('C₁: Q = 9.6 μC, V = 4.8 V');
    await expect(readout).toContainText('C₂: Q = 14.4 μC, V = 4.8 V');
    await expect(readout).toContainText('144 μJ → 57.6 μJ');
    expect((await progress(page)).tasks['fig-2-8b:share']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-8"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'C/2' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: adding capacitances in series is caught as that misconception, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.8-series-c"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('10');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('במקביל');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.8-series-c', correct: false, misconception: 'MC-series-capacitances-add', lesson: '2.8' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2.4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the bigger capacitor takes more charge in series" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.8-series-charge"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'כי הקיבול שלו גדול יותר' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.8-series-charge', correct: false, confident: true, misconception: 'MC-series-charge-by-c' });
  });
});
