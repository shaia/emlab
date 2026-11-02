import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-4/';

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

const noSideScroll = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

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

  test('F = qvB·sinα: up on a proton, down on an electron, none at rest or along B', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-4a');
    const readout = fig.locator('.sim-readout');
    const sliders = fig.locator('input[type=range]');
    // the figure starts at rest, so it does not give the prediction away
    await expect(readout).toContainText('אין כוח: המטען במנוחה');
    // a proton at 2·10⁶ m/s moving right across 0.5 T into the page: e·v·B = 1.6·10⁻¹³ N, up
    await setSlider(sliders.nth(1), 2e6);
    await expect(readout).toContainText('1.6·10⁻¹³ N');
    await expect(readout).toContainText('כיוון הכוח: למעלה');
    await fig.getByRole('button', { name: /אלקטרון/ }).click();
    await expect(readout).toContainText('כיוון הכוח: למטה');
    await expect(readout).toContainText('1.6·10⁻¹³ N');
    await setSlider(sliders.nth(1), 0); // speed
    await expect(readout).toContainText('אין כוח: המטען במנוחה');
    await setSlider(sliders.nth(1), 2e6);
    await setSlider(sliders.nth(0), 30); // α = 30°: half the force
    await expect(readout).toContainText('8·10⁻¹⁴ N');
    await setSlider(sliders.nth(0), 0);
    await expect(readout).toContainText('אין כוח: המהירות לאורך השדה');
    const tasks = (await progress(page)).tasks;
    for (const t of ['electron', 'rest', 'along']) expect(tasks[`fig-4-4a:${t}`]).toBeTruthy();
  });

  test('a field to the right and a velocity up give a force into the page, seen face-on as ⊗', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-4a');
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').nth(1), 2e6);
    await fig.getByRole('group', { name: 'כיוון השדה B' }).getByRole('button', { name: 'ימינה' }).click();
    await fig.getByRole('group', { name: 'כיוון המהירות כש-α = 90°' }).getByRole('button', { name: 'למעלה' }).click();
    await expect(readout).toContainText('כיוון הכוח: ⊗ לתוך הדף');
    await setSlider(fig.locator('input[type=range]').nth(3), 0);
    expect((await progress(page)).tasks['fig-4-4a:face-on']).toBeTruthy();
    await noSideScroll(page);
  });

  test('a magnetic strip keeps the speed and can turn the charge back; an electric one speeds it up', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-4b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('פי 1.00');
    await expect(readout).toContainText('עובר את האזור');
    const strength = fig.locator('input[type=range]').first();
    await setSlider(strength, 5); // 0.2 T
    await expect(readout).toContainText('חוזר שמאלה, למעלה מנקודת הכניסה');
    await expect(readout).toContainText('פי 1.00');
    await fig.getByRole('button', { name: /מטען שלילי/ }).click();
    await expect(readout).toContainText('חוזר שמאלה, למטה מנקודת הכניסה');
    await fig.getByRole('button', { name: 'שדה חשמלי' }).click();
    await expect(readout).toContainText('ויוצא מהיר יותר');
    await expect(readout).not.toContainText('פי 1.00');
    const tasks = (await progress(page)).tasks;
    for (const t of ['turn-back', 'negative', 'electric']) expect(tasks[`fig-4-4b:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-4"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'לתוך הדף, בכיוון השדה' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: cosine instead of sine is caught as that misconception, then 1.39·10⁻¹⁴ N passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.4-magnitude"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('8e-15');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.4-magnitude', correct: false, misconception: 'MC-magnetic-force-max-parallel', lesson: '4.4' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1.39*10^-14');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('vector: forgetting that the electron is negative is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.4-dir-electron"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: 'למעלה', exact: true }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.4-dir-electron', correct: false, confident: true, misconception: 'MC-magnetic-force-sign-blind' });
  });

  test('vector: a force into the page is answered with ⊗', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.4-dir-proton"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: /לתוך הדף/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSideScroll(page);
  });
});
