import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-3/';

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

  test('a loop: μ₀NI/(2R) at the centre, and reversing the current moves the north pole', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-3a');
    const readout = fig.locator('.sim-readout');
    // 5 A in one turn of 15 cm
    await expect(readout).toContainText('B = μ₀NI/(2R) = 2.09·10⁻⁵ T');
    await expect(readout).toContainText('הקצה הימני');
    await fig.getByRole('button', { name: 'הפכו את כיוון הזרם' }).click();
    await expect(readout).toContainText('הקצה השמאלי');
    await expect(readout).toContainText('שמאלה');
    // 20 turns: twenty times the field
    await setSlider(fig.locator('input[type=range]').nth(1), 20);
    await expect(readout).toContainText('4.19·10⁻⁴ T');
    expect((await progress(page)).tasks['fig-4-3a:reverse']).toBeTruthy();
  });

  test('turns pulled together, and a solenoid whose field doubles when it is half as long', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-3a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'כמה כריכות', exact: true }).click();
    await setSlider(fig.locator('input[type=range]').nth(1), 0.03);
    await fig.getByRole('button', { name: 'סליל', exact: true }).click();
    // 400 turns on 80 cm with 2 A: μ₀NI/L = 1.26 mT; the finite solenoid gives 1.24 mT at its centre
    await expect(readout).toContainText('B = μ₀NI/L = 1.26·10⁻³ T');
    await expect(readout).toContainText('n = N/L = 500 1/m');
    await expect(readout).toContainText('B = 1.24·10⁻³ T');
    await setSlider(fig.locator('input[type=range]').nth(2), 0.4);
    await expect(readout).toContainText('B = μ₀NI/L = 2.51·10⁻³ T');
    await expect(readout).toContainText('B = 2.37·10⁻³ T');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-4-3a:close-loops']).toBeTruthy();
    expect(tasks['fig-4-3a:half-length']).toBeTruthy();
  });

  test("Ampère: a circle round the wire sums to μ₀I; moved off the wire, the sum is zero", async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-3b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('6.28·10⁻⁶ T·m');
    await expect(readout).toContainText('I = 5 A');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // space selects the probe, then the whole path; shift+arrow moves it 5 cm
    await canvas.press(' ');
    await canvas.press(' ');
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('I = 0 A');
    await expect(readout).toContainText('B∥·Δℓ סביב המסלול: 0 T·m');
    // the probe still reads a field: zero sum is not zero field
    await expect(readout).not.toContainText('בגשש: B = 0 T');
    expect((await progress(page)).tasks['fig-4-3b:ampere-zero']).toBeTruthy();
  });

  test('Ampère in a solenoid: a rectangle across one row encloses 400 A, and the inside edge carries the sum', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-3b');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'סליל', exact: true }).click();
    await expect(readout).toContainText('I = 400 A');
    await expect(readout).toContainText('μ₀I = 5.03·10⁻⁴ T·m');
    await expect(readout).toContainText('למטה 4.93·10⁻⁴');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press(' ');
    await canvas.press(' ');
    await canvas.press('ArrowUp');
    await expect(readout).toContainText('I = 400 A');
    expect((await progress(page)).tasks['fig-4-3b:ampere-solenoid']).toBeTruthy();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-3"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'קרוב לכריכות' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: forgetting the turns is caught as that misconception, then 3.77 mT passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.3-solenoid-B"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.00471');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.3-solenoid-B', correct: false, misconception: 'MC-solenoid-length-irrelevant', lesson: '4.3' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.77');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the compass points to the south end" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.3-compass-inside"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'שמאלה, אל הקצה הדרומי' }).click();
    await q.locator('.reasons label', { hasText: 'תמיד נמשך' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.3-compass-inside', correct: false, confident: true, misconception: 'MC-compass-inside-solenoid' });
  });
});
