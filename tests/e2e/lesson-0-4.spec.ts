import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/0-4/';

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

test('a ruler laid along the spring data matches the best line and ticks the task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-4a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toContainText('m/N');
  await freezeSteps(page);
  const task = fig.locator('.sim-tasks li').first();
  await expect(task).not.toHaveClass(/done/);
  const canvas = fig.locator('canvas');
  await canvas.focus();
  // spring axes run to 6 N and 0.25 m; the best line is L ≈ 0.119 m + 0.0202 m/N · F.
  // Handle 1 from (0.12, 0.30) to (0.12, 0.54) of the plot, handle 2 from (0.88, 0.62) to (0.88, 0.90).
  for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowUp');
  for (let i = 0; i < 4; i++) await canvas.press('ArrowUp');
  await canvas.press(' ');
  for (let i = 0; i < 5; i++) await canvas.press('Shift+ArrowUp');
  for (let i = 0; i < 3; i++) await canvas.press('ArrowUp');
  await expect(task).toHaveClass(/done/);
});

test('linearizing: d against t² and F against 1/r² tick their tasks', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-4b');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toBeVisible();
  await freezeSteps(page);
  await fig.getByRole('button', { name: 't²', exact: true }).click();
  await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'הקו המתאים ביותר' }).click();
  await expect(fig.locator('.sim-readout')).toContainText('m/s²');

  await fig.getByRole('button', { name: 'שני כדורים טעונים' }).click();
  await fig.getByRole('button', { name: '1/r', exact: true }).click();
  await expect(fig.locator('.sim-tasks li').nth(1)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: '1/r²', exact: true }).click();
  await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-4b:linearize-coulomb']).toBeTruthy();
});

test('g from the slope: forgetting the ½ gets its own feedback', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-0.4-g-from-slope"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('4.9');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('זה השיפוע עצמו');
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('9.8');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
