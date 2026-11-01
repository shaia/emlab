import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-6/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

test.describe('live figure', () => {
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

  test('the figure draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const c = page.locator('.sim-stage canvas');
    expect(await c.count()).toBe(1);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test('C stays put when V doubles, doubles with A, halves with d; E ignores A', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-6a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    // a text step may have changed the figure before the freeze: start from its own state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    const [area, gap, volts] = [0, 1, 2].map((i) => fig.locator('input[type=range]').nth(i));
    // 200 cm², 2 mm, 200 V: C = ε₀A/d = 88.5 pF, Q = 17.7 nC, E = 10⁵ V/m
    await expect(readout).toContainText('C = 88.5 pF');
    await expect(readout).toContainText('Q = 17.7 nC');
    await setSlider(volts, 400);
    await expect(readout).toContainText('Q = 35.4 nC');
    await expect(readout).toContainText('C = 88.5 pF');
    await setSlider(volts, 200);
    await setSlider(area, 400);
    await expect(readout).toContainText('C = 177 pF');
    await expect(readout).toContainText('E = 1·10⁵ V/m');
    await setSlider(area, 200);
    await setSlider(gap, 4);
    await expect(readout).toContainText('Q = 8.85 nC');
    await expect(readout).toContainText('E = 5·10⁴ V/m');
    const tasks = (await progress(page)).tasks;
    for (const t of ['voltage', 'area', 'gap']) expect(tasks[`fig-2-6a:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-6"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'הוא יקטן פי 2.' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: millimetres left unconverted get targeted feedback, then the right capacitance passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.6-plates-c"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('8.85e-13');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('מילימטר');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('8.85e-10');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "a wider gap stores more" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.6-double-gap"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'הוא גדל פי 2.' }).click();
    await q.locator('.reasons label', { hasText: 'יותר מקום' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.6-double-gap', correct: false, confident: true, misconception: 'MC-wider-gap-more-capacitance', lesson: '2.6' });
  });
});
