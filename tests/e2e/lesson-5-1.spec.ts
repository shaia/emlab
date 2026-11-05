import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-1/';

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

  test('all three figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('Φ = BA·cosθ: 16 lines and 8 mWb facing the field, half at 60°, zero edge-on, reversed with the normal', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-1a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('Φ = B·A·cosθ = 8·10⁻³ Wb');
    await expect(readout).toContainText('דרך הלולאה: 16');
    const angle = fig.locator('input[type=range]').first();
    await setSlider(angle, 60);
    await expect(readout).toContainText('= 4·10⁻³ Wb');
    await expect(readout).toContainText('דרך הלולאה: 8');
    await fig.getByRole('button', { name: 'הפכו את האנך' }).click();
    await expect(readout).toContainText('= -4·10⁻³ Wb');
    await expect(readout).toContainText('θ = 120°');
    await setSlider(angle, 90);
    await expect(readout).toContainText('Φ = B·A·cosθ = 0 Wb');
    await setSlider(fig.locator('input[type=range]').nth(1), 0.4);
    await setSlider(fig.locator('input[type=range]').nth(2), 0.3);
    const tasks = (await progress(page)).tasks;
    for (const t of ['half', 'flip-normal', 'edge-on', 'three-ways']) expect(tasks[`fig-5-1a:${t}`]).toBeTruthy();
  });

  test('the wire flux: one strip underestimates, more strips reach μ₀Ih·ln(r₂/r₁)/2π, moving away lowers it, reversing I flips it', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-1b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('ΣB·h·Δr = 4·10⁻⁷ Wb');
    await expect(readout).toContainText('Φ = 4.39·10⁻⁷ Wb');
    const strips = fig.locator('input[type=range]').first();
    await setSlider(strips, 1);
    await expect(readout).toContainText('ΣB·h·Δr = 4.27·10⁻⁷ Wb');
    await setSlider(strips, 3);
    await expect(readout).toContainText('ΣB·h·Δr = 4.39·10⁻⁷ Wb');
    // a real drag passes every value on the way
    const near = fig.locator('input[type=range]').nth(1);
    for (const v of [0.06, 0.07, 0.08, 0.09, 0.1]) await setSlider(near, v);
    await expect(readout).toContainText('Φ = 2.77·10⁻⁷ Wb');
    await fig.getByRole('button', { name: /כיוון הזרם/ }).click();
    await expect(readout).toContainText('Φ = -2.77·10⁻⁷ Wb');
    const tasks = (await progress(page)).tasks;
    for (const t of ['more-strips', 'move-away', 'reverse-current']) expect(tasks[`fig-5-1b:${t}`]).toBeTruthy();
  });

  test('closed field lines: as many leave the circle as enter it, around a pole or around the whole magnet', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-1c');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('נטו: 0');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // from (−0.30, −0.20) to (0.16, 0): only the north pole (x = +0.15) inside the 10 cm circle
    for (let i = 0; i < 23; i++) await canvas.press('ArrowRight');
    for (let i = 0; i < 10; i++) await canvas.press('ArrowUp');
    await expect(readout).toContainText('בתוך העיגול רק הקוטב הצפוני');
    await expect(readout).toContainText('נטו: 0');
    await expect(readout).not.toContainText('יוצאים מהעיגול: 0 ');
    for (let i = 0; i < 8; i++) await canvas.press('ArrowLeft');
    await setSlider(fig.locator('input[type=range]').first(), 0.22);
    await expect(readout).toContainText('כל המגנט בתוך העיגול');
    await expect(readout).toContainText('נטו: 0');
    const tasks = (await progress(page)).tasks;
    for (const t of ['around-north', 'whole-magnet']) expect(tasks[`fig-5-1c:${t}`]).toBeTruthy();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-1"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    // a choice clicked before the island hydrates lands in the static HTML and is lost
    const choice = predict.locator('label.q-choice', { hasText: 'הוא קטן לחצי' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: "a half turn changes nothing" is told apart, then −2BA passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.1-flip-sign"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('האנך התהפך');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('-0.0188');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the north pole is a source" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.1-closed-pole"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    // choices are shuffled per question, so pick them by text
    await q.locator('.q-choices').first().locator('label', { hasText: 'חיובי: מהקוטב הצפוני' }).click();
    await q.locator('.reasons label', { hasText: 'כמו מטען חיובי' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.1-closed-pole', correct: false, confident: true, misconception: 'MC-magflux-pole-like-charge' });
  });
});
