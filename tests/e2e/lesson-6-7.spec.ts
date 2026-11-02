import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-7/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-7a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const noSidewaysScroll = async (page: Page) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sw).toBeLessThanOrEqual(0);
};

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

  test('a uniform field of 2000 N/C has zero net flux out of the box', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('Φ = 0 N·m²/C');
    await expect(readout).toContainText('|E| = 2000 N/C');
    await fig.locator('canvas').focus();
    await fig.locator('canvas').press('ArrowUp');
    await expect(readout).toContainText('Φ = 0 N·m²/C');
    expect((await progress(page)).tasks['fig-6-7a:uniform-zero']).toBeTruthy();
  });

  test('beside the line charge the field is strong and ∇·E = 0; with the line inside the ratio has no limit', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'קו טעון', exact: true }).click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // from (4, 1) cm to (2.5, 1) cm: 2.7 cm from the line, which stays outside the 4 cm box
    for (let i = 0; i < 3; i++) await canvas.press('ArrowLeft');
    await expect(readout).toContainText('Φ/V = 0 N/(C·m)');
    await expect(readout).toContainText('∇·E = 0 N/(C·m)');
    await expect(readout).not.toContainText('|E| = 0 N/C');
    expect((await progress(page)).tasks['fig-6-7a:line-outside']).toBeTruthy();
    // on to (0, 0): the box now holds the line, and the flux is λa/ε₀ ≈ 45.2
    for (let i = 0; i < 5; i++) await canvas.press('ArrowLeft');
    for (let i = 0; i < 2; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('Φ = 45.2 N·m²/C');
    await expect(readout).toContainText('אין כאן גבול');
  });

  test('on the axis of the uniformly charged rod E = 0, yet Φ/V = ρ/ε₀', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'מוט טעון', exact: true }).click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press('Shift+ArrowLeft');
    await canvas.press('Shift+ArrowLeft');
    await canvas.press('ArrowDown');
    await canvas.press('ArrowDown');
    await expect(readout).toContainText('|E| = 0 N/C');
    await expect(readout).toContainText('Φ/V = 1.13·10⁵ N/(C·m)');
    expect((await progress(page)).tasks['fig-6-7a:rod-centre']).toBeTruthy();
  });

  test('graded rod: shrinking the box brings Φ/V to ρ/ε₀ at the centre; split boxes add up to the whole', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'מוט, צפיפות שגדלה', exact: true }).click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // to (3, 0) cm, where ρ/ε₀ ≈ 1.02·10⁵
    for (let i = 0; i < 2; i++) await canvas.press('ArrowLeft');
    for (let i = 0; i < 2; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('∇·E = 1.02·10⁵ N/(C·m)');
    const sliders = fig.locator('input[type=range]');
    await setSlider(sliders.nth(0), 0.01);
    await expect(readout).toContainText('Φ/V = 1.02·10⁵ N/(C·m)');
    expect((await progress(page)).tasks['fig-6-7a:graded-shrink']).toBeTruthy();
    await setSlider(sliders.nth(0), 0.04);
    await setSlider(sliders.nth(1), 3);
    await expect(readout).toContainText('3×3×3 קוביות קטנות');
    const nums = await readout.locator('span', { hasText: 'קוביות קטנות' }).locator('b.q').allTextContents();
    expect(nums).toHaveLength(2);
    expect(nums[0]).toBe(nums[1]);
    expect((await progress(page)).tasks['fig-6-7a:split-box']).toBeTruthy();
    await noSidewaysScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-7"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    // a choice clicked before the island hydrates lands in the static HTML and is lost
    const choice = predict.locator('label.q-choice', { hasText: 'חיובי וגדול' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: dividing by kilometres gets targeted feedback, then 0.885 nC/m³ passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.7-balloon"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('885');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('בקילומטרים');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.885');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSidewaysScroll(page);
  });

  test('a confident "strong field means big divergence" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.7-beside-line"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'חיובי וגדול' }).click();
    await q.locator('.reasons label', { hasText: 'קווי השדה מתפזרים' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.7-beside-line', correct: false, confident: true, misconception: 'MC-strong-field-big-divergence' });
  });
});
