import { expect, test } from '@playwright/test';
import { hydrated, inked, progress, rankTo } from './helpers';

const LESSON = '/lessons/0-1/';

test('the practice figure draws, with the lesson’s own task wording', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-1');
  await fig.scrollIntoViewIfNeeded();
  const canvas = fig.locator('.sim-stage canvas');
  await expect(canvas).toHaveCSS('direction', 'ltr');
  await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  // 0.1 introduces the figure before its physics: no "test charge" in the task list yet
  await expect(fig.locator('.sim-tasks li').first()).toContainText('גררו את הכדור הקטן');
  await expect(fig.locator('.sim-tasks')).not.toContainText('מטען הבוחן');
});

test('the slider ticks a task, and a text step drives the figure', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-1');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toBeVisible();
  const slider = fig.locator('input[type=range]').first();
  // q₀ steps are [-4..-1, 1..4] nC; index 5 is +2 nC
  await slider.evaluate((el: HTMLInputElement) => {
    el.value = '5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-1:change-q0']).toBeTruthy();

  // this is the step bus itself under test, so steps are not frozen here
  const vectors = fig.getByRole('button', { name: 'וקטורי שדה' });
  await page.locator('[data-step="steps"]').click();
  await expect(vectors).toHaveAttribute('aria-pressed', 'true');
});

test('the prediction is kept, and the summary returns to it', async ({ page }) => {
  await page.goto(LESSON);
  const predict = page.locator('[data-predict-id="pred-0-1"]');
  await predict.scrollIntoViewIfNeeded();
  await hydrated(predict);
  await predict.locator('label.q-choice').nth(0).click();
  await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
  await expect(predict).toHaveClass(/is-open/);
  await page.locator('.revisit').scrollIntoViewIfNeeded();
  await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
});

test('ranking the four confidence outcomes', async ({ page }) => {
  await page.goto(LESSON);
  const r = page.locator('[data-qid="Q-0.1-rank-review"]');
  await r.scrollIntoViewIfNeeded();
  await hydrated(r);
  // the answer is wrong-sure, wrong-unsure, right-unsure, right-sure
  await rankTo(r, ['טעיתם, וסימנתם "בטוחים"', 'טעיתם, וסימנתם "לא', 'עניתם נכון, וסימנתם "לא', 'עניתם נכון, וסימנתם "בטוחים"']);
  await r.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(r).toHaveClass(/is-right/);
});
