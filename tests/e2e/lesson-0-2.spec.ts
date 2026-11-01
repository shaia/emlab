import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/0-2/';

test('all three figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  const canvases = page.locator('.sim-stage canvas');
  await expect(canvases).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const c = canvases.nth(i);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  }
});

test('a 3-4 vector has magnitude 5, and the task ticks', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-2a');
  await fig.scrollIntoViewIfNeeded();
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('A = (2, 3) N');
  await freezeSteps(page);
  const canvas = fig.locator('canvas');
  await canvas.focus();
  await canvas.press('ArrowRight');
  await canvas.press('ArrowUp');
  await expect(readout).toContainText('A = (3, 4) N');
  await expect(readout).toContainText('|A| = 5 N');
  await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-2a:make-3-4']).toBeTruthy();
});

test('3 N right plus 4 N up sum to 5 N (the prediction), perpendicular task ticks', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-2b');
  await fig.scrollIntoViewIfNeeded();
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('A = (3, 1) N');
  await freezeSteps(page);
  const canvas = fig.locator('canvas');
  await canvas.focus();
  await canvas.press('ArrowDown'); // A = (3, 0); an arrow key selects A
  await canvas.press(' '); // selects B
  await canvas.press('ArrowLeft'); // B = (0, 2)
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp'); // B = (0, 4)
  await expect(readout).toContainText('B = (0, 4) N');
  await expect(readout).toContainText('|A+B| = 5 N');
  await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
});

test('looking straight down at the page shows ⊙, then ⊗', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-2c');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toContainText('30°');
  await freezeSteps(page);
  // whichever step was last on screen set the direction; start from "out" explicitly
  await fig.getByRole('button', { name: /החוצה מהדף/ }).click();
  await fig.locator('input[type=range]').evaluate((el: HTMLInputElement) => {
    el.value = '90';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(fig.locator('.sim-readout')).toContainText('מבט ישר על הדף');
  await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: /לתוך הדף/ }).click();
  await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-2c:see-in']).toBeTruthy();
});

test('an out-of-page answer on the rose', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-0.2-opposite-of-out"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: /החוצה מהדף/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-wrong/);
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: /לתוך הדף/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
