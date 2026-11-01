import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-2/';

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

  test('at twice the distance the potential halves while the field drops by four', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-2a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    // a text step may have changed the figure before the freeze: start from its own state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    // 2 μC, 30 cm: V = kQ/r = 6·10⁴ V, E = kQ/r² = 2·10⁵ N/C
    await expect(readout).toContainText('V = 6·10⁴ V');
    await expect(readout).toContainText('E = 2·10⁵ N/C');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('60 cm');
    await expect(readout).toContainText('V = 3·10⁴ V');
    await expect(readout).toContainText('E = 5·10⁴ N/C');
    await fig.getByRole('button', { name: 'מטען שלילי' }).click();
    await expect(readout).toContainText('V = -6·10⁴ V');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-2-2a:read-v']).toBeTruthy();
    expect(tasks['fig-2-2a:half-v']).toBeTruthy();
    expect(tasks['fig-2-2a:neg-v']).toBeTruthy();
  });

  test('midway between like charges the field vanishes but the potentials add; in a dipole V = 0', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-2b');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    // a text step may have changed the figure before the freeze: start from its own state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowDown');
    await expect(readout).toContainText('V = 9·10⁴ V');
    await expect(readout).toContainText('V₁ = 4.5·10⁴ V · V₂ = 4.5·10⁴ V');
    await expect(readout).toContainText('E = 0');
    expect((await progress(page)).tasks['fig-2-2b:sum-like']).toBeTruthy();
    await fig.getByRole('button', { name: 'דיפול' }).click();
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowDown');
    await expect(readout).toContainText('הפוטנציאל ב-P: V = 0');
    await expect(readout).not.toContainText('E = 0');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-2"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'הפוטנציאלים של שני המטענים מתחברים' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: subtracting potentials like vectors is caught as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.2-two-charges-sum"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('9e4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('סקלר');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.2-two-charges-sum', correct: false, misconception: 'MC-potential-is-vector', lesson: '2.2' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1.5e5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "electrons go to lower potential" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.2-electron-direction"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'שמאלה, לכיוון הפוטנציאל הנמוך' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.2-electron-direction', correct: false, confident: true, misconception: 'MC-electron-to-lower-potential' });
  });
});
