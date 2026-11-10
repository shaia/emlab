import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, progress, rankTo } from './helpers';

const LESSON = '/lessons/0-3/';

test('the ruler reads 2 μC three ways, then 15 cm, ticking both tasks', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-3a');
  await fig.scrollIntoViewIfNeeded();
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('30 μC');
  await freezeSteps(page);
  const canvas = fig.locator('canvas');
  await expect(canvas).toHaveCSS('direction', 'ltr');
  await canvas.focus();
  // 3·10⁻⁵ → one power down (Shift) → 3·10⁻⁶ → two notches down → 2·10⁻⁶
  await canvas.press('Shift+ArrowLeft');
  await canvas.press('ArrowLeft');
  await canvas.press('ArrowLeft');
  await expect(readout).toContainText('2·10⁻⁶ C');
  await expect(readout).toContainText('2 μC');
  await expect(readout).toContainText('0.000002 C');
  await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/);

  await fig.getByRole('button', { name: 'אורך, במטר' }).click();
  await canvas.focus();
  for (let i = 0; i < 5; i++) await canvas.press('Shift+ArrowRight'); // 2·10⁻¹ m
  await canvas.press('ArrowLeft'); // 1.5·10⁻¹ m
  await expect(readout).toContainText('15 cm');
  await expect(readout).toContainText('0.15 m');
  await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-3a:set-15cm']).toBeTruthy();
});

test('a prefix converted the wrong way gets its own feedback', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-0.3-micro"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('3*10^6');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('הכיוון הפוך');
  expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-0.3-micro', misconception: 'MC-power-direction', confident: true });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('3e-6');
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});

test('ranking charges with a tie', async ({ page }) => {
  await page.goto(LESSON);
  const r = page.locator('[data-qid="Q-0.3-rank-charges"]');
  await r.scrollIntoViewIfNeeded();
  await hydrated(r);
  // the answer is 3000 μC > 2 mC = 2·10⁶ nC > 5·10⁻⁴ C
  await rankTo(r, ['3000\\,\\mu', '2\\,\\text{mC}', '2\\cdot10^{6}', '5\\cdot10^{-4}'], [1]);
  await r.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(r).toHaveClass(/is-right/);
});
