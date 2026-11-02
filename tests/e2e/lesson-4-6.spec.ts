import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-6/';

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
    expect(await canvases.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('doubling the speed doubles the radius but not the period, and the race ticks', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-6a');
    const readout = fig.locator('.sim-readout');
    // proton, 3·10⁵ m/s, 0.05 T
    await expect(readout).toContainText('r = mv/(|q|B) = 6.26 cm');
    await expect(readout).toContainText('T = 2πm/(|q|B) = 1.31·10⁻⁶ s');
    await expect(readout).toContainText('נגד כיוון השעון');
    // speeds are [1, 2, 3, 4, 5, 6, 8, 10]·10⁵ m/s: index 5 is 6·10⁵
    await setSlider(fig.locator('input[type=range]').nth(0), 5);
    await expect(readout).toContainText('r = mv/(|q|B) = 12.5 cm');
    await expect(readout).toContainText('T = 2πm/(|q|B) = 1.31·10⁻⁶ s');
    await setSlider(fig.locator('input[type=range]').nth(0), 2);
    await fig.getByRole('button', { name: 'חלקיק שני במהירות כפולה' }).click();
    await expect(readout).toContainText('החלקיק השני: r = 12.5 cm, T = 1.31·10⁻⁶ s');
    expect((await progress(page)).tasks['fig-4-6a:race']).toBeTruthy();
  });

  test('a doubled field halves the period; an electron turns the other way', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-6a');
    const readout = fig.locator('.sim-readout');
    // fields are [2, 3, 4, 5, 6, 8, 10, 15, 20] units: index 6 is 0.1 T for a proton
    await setSlider(fig.locator('input[type=range]').nth(1), 6);
    await expect(readout).toContainText('T = 2πm/(|q|B) = 6.56·10⁻⁷ s');
    await expect(readout).toContainText('r = mv/(|q|B) = 3.13 cm');
    await fig.getByRole('button', { name: 'אלקטרון', exact: true }).click();
    await expect(readout).toContainText('עם כיוון השעון');
    await fig.getByRole('button', { name: '⊙ השדה החוצה מהדף' }).click();
    await expect(readout).toContainText('נגד כיוון השעון');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-4-6a:half-T']).toBeTruthy();
    expect(tasks['fig-4-6a:flip-sign']).toBeTruthy();
  });

  test('a proton entering the field edge leaves one diameter away, after the same time at any speed', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-6b');
    const readout = fig.locator('.sim-readout');
    // proton, 3·10⁵ m/s, 0.06 T: r = 5.22 cm, d = 10.4 cm, T/2 = 5.47·10⁻⁷ s
    await expect(readout).toContainText('d = 10.4 cm');
    await expect(readout).toContainText('5.47·10⁻⁷ s');
    await setSlider(fig.locator('input[type=range]').nth(0), 5); // 6·10⁵ m/s
    await expect(readout).toContainText('d = 20.9 cm');
    await expect(readout).toContainText('5.47·10⁻⁷ s');
    expect((await progress(page)).tasks['fig-4-6b:edge-double']).toBeTruthy();
    // entry at 30° to the normal: d = 2r·cos30°
    await setSlider(fig.locator('input[type=range]').nth(0), 2);
    await setSlider(fig.locator('input[type=range]').nth(2), 6);
    await expect(readout).toContainText('d = 9.04 cm');
    expect((await progress(page)).tasks['fig-4-6b:edge-angle']).toBeTruthy();
  });

  test('the spectrometer lands the heavier isotope farther, and both tasks can be met', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-6c');
    const readout = fig.locator('.sim-readout');
    // neon at 1000 V, 0.2 T
    await expect(readout).toContainText('20.4 cm');
    await expect(readout).toContainText('21.4 cm');
    const [U, B] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
    // voltages are 500 + 250·i: index 4 is 1500 V, which puts ²⁰Ne⁺ on the 25 cm mark
    await setSlider(U, 4);
    await expect(readout).toContainText('25 cm');
    expect((await progress(page)).tasks['fig-4-6c:hit-mark']).toBeTruthy();
    await fig.getByRole('button', { name: 'כלור', exact: true }).click();
    await setSlider(U, 6); // 2000 V: Cl-35 at 38.2 cm, Cl-37 at 39.3 cm
    await expect(readout).toContainText('Δx = 1.08 cm');
    expect((await progress(page)).tasks['fig-4-6c:separate']).toBeTruthy();
    await setSlider(B, 0); // 0.1 T: both land beyond the detector
    await expect(readout).toContainText('מחטיא את הגלאי');
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(w[0]).toBeLessThanOrEqual(w[1]);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-6"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    // a choice clicked before hydration lands in the static HTML and never enables the button
    await hydrated(predict.locator('label.q-choice').first());
    await predict.locator('label.q-choice', { hasText: 'הזמן לא משתנה' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the diameter gets targeted feedback, then the radius passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.6-radius"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('4.18');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הקוטר');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2.09');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "faster goes round sooner" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.6-double-speed"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'השני חוזר ראשון' }).click();
    await q.locator('.reasons label', { hasText: 'הכוח על המהיר כפול' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.6-double-speed', correct: false, confident: true, misconception: 'MC-orbit-period-depends-on-speed', lesson: '4.6' });
  });
});
