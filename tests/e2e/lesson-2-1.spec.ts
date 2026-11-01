import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, progress } from './helpers';

const LESSON = '/lessons/2-1/';

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
      await expect
        .poll(() =>
          c.evaluate((el: HTMLCanvasElement) => {
            const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
            let inked = 0;
            for (let k = 3; k < d.length; k += 4 * 7) if (d[k] > 0) inked++;
            return inked;
          }),
        )
        .toBeGreaterThan(200);
    }
  });

  test('a straight path and a long detour from A to B log the same work', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-1a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const canvas = fig.locator('canvas');
    const readout = fig.locator('.sim-readout');
    await canvas.focus();
    // A is at x = −0.5 m, B at x = +0.35 m: 8 long steps and 2 short ones end 1 cm short of B
    const right = async () => {
      for (let i = 0; i < 8; i++) await canvas.press('Shift+ArrowRight');
      for (let i = 0; i < 2; i++) await canvas.press('ArrowRight');
    };
    await right();
    // W = qE·d = 10⁻⁹ C · 10⁴ N/C · 0.84 m
    await expect(readout).toContainText('W = 8.4·10⁻⁶ J');
    await expect(readout).toContainText('84 cm');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);

    await fig.getByRole('button', { name: 'חזרה ל-A' }).click();
    await canvas.focus();
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowUp');
    await right();
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowDown');
    await expect(readout).toContainText('164 cm → W = 8.4·10⁻⁶ J');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-2-1a:reach-b']).toBeTruthy();
    expect(tasks['fig-2-1a:two-paths']).toBeTruthy();
  });

  test('moving across the field does no work, and a closed loop does none either', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-1a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const canvas = fig.locator('canvas');
    const readout = fig.locator('.sim-readout');
    await canvas.focus();
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowUp');
    await expect(readout).toContainText('W = 0');
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowRight');
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowDown');
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowLeft');
    await expect(readout).toContainText('160 cm');
    await expect(readout).toContainText('W = 0');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-2-1a:perp']).toBeTruthy();
    expect(tasks['fig-2-1a:loop']).toBeTruthy();
  });

  test('bringing a positive test charge toward the source does negative work and raises U', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-1b');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const canvas = fig.locator('canvas');
    const readout = fig.locator('.sim-readout');
    // A is 30 cm from Q: U = kQq/r = 6·10⁻⁵ J
    await expect(readout).toContainText('U = 6·10⁻⁵ J');
    await canvas.focus();
    // from (−0.37, 0.24) to (−0.47, 0.04): inside the 10 cm core, so the charge is held 10 cm from Q
    for (let i = 0; i < 2; i++) await canvas.press('Shift+ArrowDown');
    await canvas.press('Shift+ArrowLeft');
    await expect(readout).toContainText('W = -');
    expect((await progress(page)).tasks['fig-2-1b:closer']).toBeTruthy();
    await fig.getByRole('button', { name: 'מטען בוחן שלילי' }).click();
    await expect(readout).toContainText('U = -6·10⁻⁵ J');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-1"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'אותה עבודה' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: centimetres instead of metres get targeted feedback, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.1-uniform-work"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('3e-4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('במטרים');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3e-6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the longer path does more work" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.1-three-paths"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'כי הוא הארוך ביותר' }).click();
    await q.locator('.reasons label', { hasText: 'זמן רב יותר' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.1-three-paths', correct: false, confident: true, misconception: 'MC-work-depends-on-path', lesson: '2.1' });
  });
});
