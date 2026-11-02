import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-10/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-4-10a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

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

  test('the torque is NBIA·sinθ: largest with the plane along B, zero with the plane across it', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    // the starting state: θ = 60°, 10 turns, 2 A, 0.5 T, 40 cm²
    await expect(readout).toContainText('θ = 60°');
    await expect(readout).toContainText('F = NBIa = 0.8 N');
    await expect(readout).toContainText('0.0346 N·m');
    const turn = fig.locator('input[type=range]').first();
    await setSlider(turn, 90);
    await expect(readout).toContainText('0.04 N·m');
    await expect(readout).toContainText('בין מישור הכריכה לשדה: 0°');
    await setSlider(turn, 0);
    await expect(readout).toContainText('NBIA·sinθ = 0 N·m');
    // the force on each side does not change with the angle
    await expect(readout).toContainText('F = NBIa = 0.8 N');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-4-10a:max-torque']).toBeTruthy();
    expect(tasks['fig-4-10a:zero-torque']).toBeTruthy();
  });

  test('a reversed current reverses the torque', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('עם כיוון השעון');
    await fig.getByRole('button', { name: 'הפכו את כיוון הזרם' }).click();
    await expect(readout).toContainText('נגד כיוון השעון');
    await expect(readout).toContainText('θ = 120°');
  });

  test('in still mode a released coil is shown where it settles: plane across B', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('emlab:settings', JSON.stringify({ still: true, theme: 'auto' })));
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'שחררו את הכריכה' }).click();
    await expect(fig.locator('.sim-readout')).toContainText('θ = 0°');
    expect((await progress(page)).tasks['fig-4-10a:settle']).toBeTruthy();
  });

  test('the motor with a commutator keeps turning; without it the coil only swings', async ({ page }) => {
    // real-time animation: a loaded machine runs the frames slowly
    test.setTimeout(90_000);
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'מנוע', exact: true }).click();
    await fig.getByRole('button', { name: 'הפעילו את המנוע' }).click();
    await expect.poll(async () => (await progress(page))?.tasks?.['fig-4-10a:motor-turns'] ?? false, { timeout: 40_000 }).toBeTruthy();
    await fig.getByRole('button', { name: 'עצרו' }).click();
    await fig.getByRole('button', { name: /קומוטטור/ }).click();
    await fig.getByRole('button', { name: 'שחררו את הכריכה' }).click();
    await expect.poll(async () => (await progress(page))?.tasks?.['fig-4-10a:no-commutator'] ?? false, { timeout: 40_000 }).toBeTruthy();
    await expect(fig.locator('.sim-readout')).toContainText('θ = 0°');
  });

  test('the moving-coil meter deflects in proportion to the current', async ({ page }) => {
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'מד זרם', exact: true }).click();
    const readout = fig.locator('.sim-readout');
    // δ = NBIA/κ = 0.04/0.12 rad
    await expect(readout).toContainText('δ = 19°');
    await setSlider(fig.locator('input[type=range]').first(), 1);
    await expect(readout).toContainText('δ = 10°');
    expect((await progress(page)).tasks['fig-4-10a:meter-current']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-10"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await hydrated(predict.locator('label.q-choice').first());
    await predict.locator('label.q-choice', { hasText: 'פונה אל הקוטב' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the angle to the plane is caught as that misconception, then 0.0338 passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.10-plane-angle"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.0123');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.10-plane-angle', correct: false, misconception: 'MC-coil-torque-plane-angle', lesson: '4.10' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.0338');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "largest when it faces the pole" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.10-max-position"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'פונה אל הקוטב' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.10-max-position', correct: false, confident: true, misconception: 'MC-coil-torque-plane-angle' });
  });
});
