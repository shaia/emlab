import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-13/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-13a');
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

/** the term button of a pair in one form ('int' or 'diff') */
const term = (fig: Locator, pair: string, form: 'int' | 'diff' = 'diff') => fig.locator(`.mx-${form} [data-pair="${pair}"]`);

test.describe('live table', () => {
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

  test('the figure draws, in LTR physics space, and the table is typeset', async ({ page }) => {
    await page.goto(LESSON);
    const c = page.locator('#fig-6-13a .sim-stage canvas');
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
    await expect(page.locator('#fig-6-13a .mx-term .katex')).toHaveCount(18);
  });

  test('clicking a term marks its partner in the other form', async ({ page }) => {
    const fig = await openFigure(page);
    await term(fig, 'faraday-rate', 'int').click();
    await expect(term(fig, 'faraday-rate', 'diff')).toHaveClass(/\bon\b/);
    await expect(term(fig, 'faraday-rate', 'diff')).toHaveAttribute('aria-pressed', 'true');
    await expect(term(fig, 'gauss-e-flux', 'diff')).not.toHaveClass(/\bon\b/);
    await expect(fig.locator('.mx-says')).toContainText('קצב השינוי של השדה המגנטי');
  });

  test('Gauss: a box half out of the rod still balances the integral form', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('∮E·dA = 3.05 N·m²/C');
    await expect(readout).toContainText('ρ/ε₀ = 1.13·10⁵ N/(C·m)');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // from (2, 1) cm to (4.5, 0) cm: the 3 cm box straddles the rod's surface at 5 cm
    for (let i = 0; i < 5; i++) await canvas.press('ArrowRight');
    for (let i = 0; i < 2; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('∮E·dA = 1.96 N·m²/C');
    await expect(readout).toContainText('Q_in/ε₀ = 1.96 N·m²/C');
    await expect(readout).toContainText('∮E·dA/V = 7.25·10⁴ N/(C·m)');
    expect((await progress(page)).tasks['fig-6-13a:gauss-edge']).toBeTruthy();
  });

  test('no magnetic charge: a box round the coil\'s north pole has zero net flux', async ({ page }) => {
    const fig = await openFigure(page);
    await term(fig, 'gauss-b-zero').click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('סליל שטוח');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // from (2, 1) cm to (0, 5) cm, the top of the coil
    await canvas.press('Shift+ArrowLeft');
    await canvas.press('Shift+ArrowUp');
    await canvas.press('Shift+ArrowUp');
    await expect(readout).toContainText('∮B·dA = 0 T·m²');
    await expect(readout).toContainText('∇·B = 0 T/m');
    expect((await progress(page)).tasks['fig-6-13a:no-monopole']).toBeTruthy();
  });

  test('Faraday on the axis: E = 0 there, yet the curl is −∂B/∂t; outside the core E ≠ 0 and the curl is 0', async ({ page }) => {
    const fig = await openFigure(page);
    await term(fig, 'faraday-rate').click();
    const readout = fig.locator('.sim-readout');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // to the axis
    await canvas.press('Shift+ArrowLeft');
    for (let i = 0; i < 2; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('|E| = 0 V/m');
    await expect(readout).toContainText('(∇×E)z = -2 V/m²');
    await expect(readout).toContainText('−∂Bz/∂t = -2 V/m²');
    await expect(readout).toContainText('∮E·dl = -1.8·10⁻³ V');
    expect((await progress(page)).tasks['fig-6-13a:faraday-axis']).toBeTruthy();
    // out to (8, 2) cm with a 2 cm loop: wholly outside the 4 cm core
    await setSlider(fig.locator('input[type=range]'), 0.02);
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowRight');
    await canvas.press('Shift+ArrowUp');
    await expect(readout).toContainText('(∇×E)z = 0 V/m²');
    await expect(readout).toContainText('|E| = 0.0194 V/m');
    expect((await progress(page)).tasks['fig-6-13a:faraday-outside']).toBeTruthy();
  });

  test('the static switch strikes out the time derivatives and kills the induced field', async ({ page }) => {
    const fig = await openFigure(page);
    await term(fig, 'faraday-circ').click();
    await fig.getByRole('button', { name: 'סטטי: שום דבר לא משתנה בזמן' }).click();
    await expect(term(fig, 'faraday-rate')).toHaveClass(/\bgone\b/);
    await expect(term(fig, 'ampere-disp', 'int')).toHaveClass(/\bgone\b/);
    await expect(term(fig, 'gauss-e-charge')).not.toHaveClass(/\bgone\b/);
    await expect(fig.locator('.mx-rest')).toContainText('∇×E = 0');
    await expect(fig.locator('.mx-rest')).toContainText('∇×B = μ₀J');
    await expect(fig.locator('.sim-readout')).toContainText('∮E·dl = 0 V');
    expect((await progress(page)).tasks['fig-6-13a:static-limit']).toBeTruthy();
  });

  test('displacement term: no current between the plates, yet the curl of B is μ₀ε₀∂E/∂t', async ({ page }) => {
    const fig = await openFigure(page);
    await term(fig, 'ampere-disp').click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('בין לוחות קבל שנטען');
    await expect(readout).toContainText('(∇×B)z = 1.11·10⁻⁵ T/m');
    await expect(readout).toContainText('μ₀ε₀·∂Ez/∂t = 1.11·10⁻⁵ T/m');
    expect((await progress(page)).tasks['fig-6-13a:gap-curl']).toBeTruthy();
    // empty space, and a loop out of the thick wire
    await fig.getByRole('button', { name: 'ריק: אין מטען ואין זרם' }).click();
    await term(fig, 'ampere-current').click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('μ₀Jz = 0 T/m');
    expect((await progress(page)).tasks['fig-6-13a:empty-limit']).toBeTruthy();
    await expect(fig.locator('.mx-rest')).toContainText('∇·E = 0');
    await noSidewaysScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-13"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'הרוטור מתאר את השדה בנקודה' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: forgetting half of the curl gets targeted feedback, then 8.1 passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.13-gap-dedt"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('4.05');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('ספרתם רק את');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('8.1');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSidewaysScroll(page);
  });

  test('a confident "the pole is a magnetic charge" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.13-pole-flux"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'חיובי: מהקוטב הצפוני הקווים יוצאים' }).click();
    await q.locator('.reasons label', { hasText: 'הקוטב הצפוני הוא מטען מגנטי חיובי' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.13-pole-flux', correct: false, confident: true, misconception: 'MC-pole-is-magnetic-charge' });
  });
});
