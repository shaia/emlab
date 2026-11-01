import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-3/';

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

  test('the resistor keeps V/I at 12 Ω; the bulb climbs from 4.4 Ω to 12 Ω', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-3a');
    const readout = fig.locator('.sim-readout');
    const slider = fig.locator('input[type=range]').first();
    const record = fig.getByRole('button', { name: 'רשמו מדידה' });
    for (const v of [1, 2, 4, 6]) {
      await setSlider(slider, v);
      await expect(readout).toContainText('R = V/I = 12 Ω');
      await record.click();
    }
    await fig.getByRole('button', { name: 'נורת להט' }).click();
    for (const [v, R] of [[0.5, '4.45 Ω'], [3, '9.09 Ω'], [6, '12 Ω'], [1, '5.86 Ω']] as const) {
      await setSlider(slider, v);
      await expect(readout).toContainText(`R = V/I = ${R}`);
      await record.click();
    }
    const tasks = (await progress(page)).tasks;
    for (const t of ['resistor-points', 'bulb-points']) expect(tasks[`fig-3-3a:${t}`]).toBeTruthy();
  });

  test('R = ρL/A: double length doubles it, double diameter quarters it, nichrome multiplies it by 65', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-3b');
    const readout = fig.locator('.sim-readout');
    // copper, 1 m, 0.5 mm
    await expect(readout).toContainText('R = ρL/A = 0.0866 Ω');
    const [len, dia] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
    await setSlider(len, 2);
    await expect(readout).toContainText('R = ρL/A = 0.173 Ω');
    await setSlider(len, 1);
    await setSlider(dia, 1);
    await expect(readout).toContainText('R = ρL/A = 0.0216 Ω');
    await setSlider(dia, 0.5);
    await fig.getByRole('button', { name: 'ניכרום' }).click();
    await expect(readout).toContainText('R = ρL/A = 5.6 Ω');
    const tasks = (await progress(page)).tasks;
    for (const t of ['double-length', 'double-diameter', 'material']) expect(tasks[`fig-3-3b:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-3"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'פחות מפי 2' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: a radius-for-diameter slip is told apart, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.3-rho-calc"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('2.8');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הרדיוס');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('11.2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "a thicker wire resists more" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.3-thicker"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'לתיל העבה התנגדות גדולה פי 4' }).click();
    await q.locator('label', { hasText: 'שטח החתך' }).first().click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.3-thicker', correct: false, confident: true, misconception: 'MC-thicker-more-resistance' });
  });
});
