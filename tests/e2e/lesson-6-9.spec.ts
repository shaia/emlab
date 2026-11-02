import { expect, test, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-9/';

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-9a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

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
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(1);
    const c = canvases.first();
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test('relaxed, the box centre equals the mean of its neighbours and the largest free value touches a conductor', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('סבבים: 0');
    await fig.getByRole('button', { name: 'עד הסוף' }).click();
    await expect(readout).toContainText('(התכנסה)');
    // the Fourier-series value at the centre of the 0.8 m × 0.5 m box is 39.8 V
    await expect(readout).toContainText('V = 39.8 V');
    await expect(readout).toContainText('ממוצע ארבעת השכנים: 39.8 V');
    await expect(readout).toContainText('צמוד למוליך או לדופן');
    expect((await progress(page)).tasks['fig-6-9a:relax']).toBeTruthy();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press('Shift+ArrowUp');
    await canvas.press('ArrowRight');
    expect((await progress(page)).tasks['fig-6-9a:mean']).toBeTruthy();
    await noSidewaysScroll(page);
  });

  test('a scrambled guess relaxes back to the same potential (uniqueness)', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'שני לוחות' }).click();
    await fig.getByRole('button', { name: 'עד הסוף' }).click();
    await expect(readout).toContainText('(התכנסה)');
    // off the centre line, where V is not zero by symmetry
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press('Shift+ArrowLeft');
    await canvas.press('Shift+ArrowUp');
    const before = await readout.locator('b').first().innerText();
    expect(before).not.toBe('V = 0 V');
    await fig.getByRole('button', { name: 'ניחוש אקראי' }).click();
    await fig.getByRole('button', { name: 'עד הסוף' }).click();
    await expect(readout).toContainText('(התכנסה)');
    await expect(readout.locator('b').first()).toHaveText(before);
    expect((await progress(page)).tasks['fig-6-9a:unique']).toBeTruthy();
  });

  test('a painted conductor relaxes too', async ({ page }) => {
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'קופסה ריקה' }).click();
    await fig.getByRole('button', { name: 'מוליך +100 V' }).click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press('Enter');
    await canvas.press('Shift+ArrowRight');
    await canvas.press('Enter');
    await fig.getByRole('button', { name: 'עד הסוף' }).click();
    await expect(fig.locator('.sim-readout')).toContainText('(התכנסה)');
    expect((await progress(page)).tasks['fig-6-9a:draw']).toBeTruthy();
  });

  test('line charge over a grounded plane: the relaxed grid matches the image solution', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'תיל מול מישור' }).click();
    await fig.getByRole('button', { name: 'עד הסוף' }).click();
    await expect(readout).toContainText('(התכנסה)');
    await fig.getByRole('button', { name: 'פתרון מטען הדמות' }).click();
    // P sits 15 cm to the right of the line, at its height: 2kλ·ln(r₂/r₁) = 11.4 V
    await expect(readout).toContainText('פתרון מטען הדמות ב-P: 11.4 V');
    await expect(readout).toContainText('V = 11.4 V');
    expect((await progress(page)).tasks['fig-6-9a:image']).toBeTruthy();
    await noSidewaysScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-9"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'מכל צד דוחפים אותו בחזרה' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: using d instead of 2d gets targeted feedback, then 50.6 μN passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.9-image-force"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('202.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('מאחוריו');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('50.6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSidewaysScroll(page);
  });

  test('a confident "surrounded on every side, so it is stable" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.9-earnshaw"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'מוקף מכל הצדדים' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.9-earnshaw', correct: false, confident: true, misconception: 'MC-interior-potential-extremum' });
  });
});
