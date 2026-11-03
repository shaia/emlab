import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-8/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-8a');
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

  test('the electrostatic field of a line charge has zero circulation, even round the line', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('∮E·dl = 0 V');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // from (5, 2) cm to (1, 0) cm: the 4 cm loop now encloses the line
    await canvas.press('Shift+ArrowLeft');
    await canvas.press('Shift+ArrowLeft');
    for (let i = 0; i < 4; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('∮E·dl = 0 V');
    // the ratio is 0 for every a, so the limit exists: ∇×E = 0 even where the line runs
    await expect(readout).toContainText('(∇×E)z = 0 V/m²');
    await expect(readout).not.toContainText('אין כאן גבול');
    await expect(readout).toContainText('לא מסתובב');
    expect((await progress(page)).tasks['fig-6-8a:line-zero']).toBeTruthy();
  });

  test('inside the current slab the lines are straight, B is zero at the centre, and the wheel turns', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'שכבת זרם', exact: true }).click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 4; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('(∇×B)z = 0.0126 T/m');
    await expect(readout).toContainText('|B| = 0 T');
    await expect(readout).toContainText('מסתובב נגד כיוון השעון');
    expect((await progress(page)).tasks['fig-6-8a:slab-turns']).toBeTruthy();
  });

  test('beside a thin wire the lines are circles and the circulation is zero', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'תיל דק', exact: true }).click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // to (3, 0) cm: 3 cm from the wire, which stays outside the loop
    await canvas.press('Shift+ArrowLeft');
    for (let i = 0; i < 4; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('∮B·dl = 0 T·m');
    await expect(readout).toContainText('לא מסתובב');
    expect((await progress(page)).tasks['fig-6-8a:wire-still']).toBeTruthy();
    // round the wire: μ₀I = 6.28·10⁻⁶ T·m
    for (let i = 0; i < 6; i++) await canvas.press('ArrowLeft');
    await expect(readout).toContainText('∮B·dl = 6.28·10⁻⁶ T·m');
  });

  test('graded wire: a shrinking loop reads μ₀J at its centre; split loops add up to the whole', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'תיל עבה, צפיפות שגדלה', exact: true }).click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // to (3, 0) cm, where μ₀J = 1.44·10⁻³ T/m
    await canvas.press('Shift+ArrowLeft');
    for (let i = 0; i < 4; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('(∇×B)z = 1.44·10⁻³ T/m');
    const sliders = fig.locator('input[type=range]');
    await setSlider(sliders.nth(0), 0.01);
    await expect(readout).toContainText('∮B·dl/A = 1.45·10⁻³ T/m');
    expect((await progress(page)).tasks['fig-6-8a:graded-loop']).toBeTruthy();
    await setSlider(sliders.nth(0), 0.04);
    await setSlider(sliders.nth(1), 3);
    await expect(readout).toContainText('3×3 לולאות קטנות');
    const nums = await readout.locator('span', { hasText: 'לולאות קטנות' }).locator('b.q').allTextContents();
    expect(nums).toHaveLength(2);
    expect(nums[0]).toBe(nums[1]);
    expect((await progress(page)).tasks['fig-6-8a:split-loop']).toBeTruthy();
    await noSidewaysScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-8"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    // a choice clicked before the island hydrates lands in the static HTML and is lost
    const choice = predict.locator('label.q-choice', { hasText: 'כל הקווים ישרים ומקבילים' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: reversing the order of the subtraction gets targeted feedback, then 2 mT/m passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.8-components"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('-2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הפכתם את סדר החיסור');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSidewaysScroll(page);
  });

  test('a confident "straight lines have no curl" is recorded as the circles misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.8-shear"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'לא, כי הקווים ישרים' }).click();
    await q.locator('.reasons label', { hasText: 'רק כשהקווים מקיפים משהו' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.8-shear', correct: false, confident: true, misconception: 'MC-curl-means-circles' });
  });
});
