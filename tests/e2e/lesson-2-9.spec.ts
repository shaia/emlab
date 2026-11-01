import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-9/';

test('both graphs draw, in LTR', async ({ page }) => {
  await page.goto(LESSON);
  const canvases = page.locator('.sim-stage canvas');
  await expect(canvases).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const c = canvases.nth(i);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  }
});

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

test('the slope of Q against V is the capacitance', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-2-9a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have switched the best line on: start from the figure's own settings
  await fig.getByRole('button', { name: 'איפוס' }).click();
  await fig.getByRole('button', { name: 'הקו המתאים ביותר' }).click();
  // seeded data around C = ε₀A/d = 3.54·10⁻¹⁰ F; the least-squares slope of this table is 3.45·10⁻¹⁰
  await expect(fig.locator('.sim-readout')).toContainText('3.45·10⁻¹⁰ C/V');
});

test('C against 1/d is straight, and its slope is ε₀A', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-2-9b');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  await fig.getByRole('button', { name: 'd²', exact: true }).click();
  await expect(fig.locator('.sim-tasks li').first()).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: '1/d', exact: true }).click();
  await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'הקו המתאים ביותר' }).click();
  // 3.57·10⁻¹³ F·m over A = 0.04 m² is ε₀ ≈ 8.9·10⁻¹²
  await expect(fig.locator('.sim-readout')).toContainText('3.57·10⁻¹³ F·m');
  expect((await progress(page)).tasks['fig-2-9b:linearize-capacitor']).toBeTruthy();
});

test('predict: the flap opens only after committing', async ({ page }) => {
  await page.goto(LESSON);
  const predict = page.locator('[data-predict-id="pred-2-9"]');
  await predict.scrollIntoViewIfNeeded();
  await expect(predict).not.toHaveClass(/is-open/);
  await predict.locator('label.q-choice').nth(2).click();
  await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
  await expect(predict).toHaveClass(/is-open/);
});

test('ε₀ from the slope: forgetting to divide by A is caught as that misconception', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-2.9-epsilon"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('3.54e-13');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('זה השיפוע עצמו');
  const a = (await progress(page)).attempts.at(-1);
  expect(a).toMatchObject({ qid: 'Q-2.9-epsilon', correct: false, misconception: 'MC-slope-is-epsilon', lesson: '2.9' });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('8.85e-12');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
