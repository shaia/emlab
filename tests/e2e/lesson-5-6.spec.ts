import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-6/';

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

  test('strip: −Bhv entering, nothing fully inside, the current reverses leaving; doubling v doubles the emf', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-6a');
    const readout = fig.locator('.sim-readout');
    const time = fig.locator('input[type=range]').nth(1);
    for (const t of [0.5, 1, 1.5, 2]) await setSlider(time, t);
    await expect(readout).toContainText('Φ = 0.01 Wb');
    await expect(readout).toContainText('ε = -0.01 V');
    await expect(readout).toContainText('I = -0.1 A');
    await expect(readout).toContainText('נגד כיוון השעון');
    await expect(readout).toContainText('F = 0.01 N');
    await setSlider(time, 4);
    await expect(readout).toContainText('I = 0');
    await expect(readout).toContainText('לא צריך לדחוף');
    await setSlider(time, 6);
    await expect(readout).toContainText('I = 0.1 A');
    await expect(readout).toContainText('בכיוון השעון');
    await setSlider(time, 8);
    // twice as fast: twice the emf
    await setSlider(fig.locator('input[type=range]').first(), 0.2);
    for (const t of [0.5, 1]) await setSlider(time, t);
    await expect(readout).toContainText('ε = -0.02 V');
    await setSlider(time, 2);
    const tasks = (await progress(page)).tasks;
    for (const t of ['full-pass', 'pause-inside', 'faster']) expect(tasks[`fig-5-6a:${t}`]).toBeTruthy();
  });

  test('charge: the area under I(t) equals −ΔΦ/R, the same at two speeds, and zero after a full pass', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-6c');
    const readout = fig.locator('.sim-readout');
    const time = fig.locator('input[type=range]').nth(1);
    for (const t of [1, 2, 3]) await setSlider(time, t);
    await expect(readout).toContainText('Σ I·Δt = -0.2 C');
    await expect(readout).toContainText('−ΔΦ/R = -0.2 C');
    for (const t of [5, 7, 8]) await setSlider(time, t);
    await expect(readout).toContainText('Σ I·Δt = 0 C');
    await expect(readout).toContainText('−ΔΦ/R = 0 C');
    await setSlider(fig.locator('input[type=range]').first(), 0.2);
    await expect(readout).toContainText('המעבר הקודם');
    for (const t of [1, 2]) await setSlider(time, t);
    await expect(readout).toContainText('Σ I·Δt = -0.2 C');
    const tasks = (await progress(page)).tasks;
    for (const t of ['entry-charge', 'two-speeds', 'net-zero']) expect(tasks[`fig-5-6c:${t}`]).toBeTruthy();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });

  test('build: the right ε steps for the flux graph pass the check, a wrong one is marked', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-6b');
    const readout = fig.locator('.sim-readout');
    const up = fig.getByRole('button', { name: 'ε למעלה' });
    const down = fig.getByRole('button', { name: 'ε למטה' });
    const next = fig.getByRole('button', { name: 'הקטע הבא' });
    const check = fig.getByRole('button', { name: 'בדיקה' });
    // −30, 0, +40, +20 mV
    const steps = [-3, 0, 4, 2];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] === 0) {
        await up.click();
        await down.click();
      }
      for (let k = 0; k < Math.abs(steps[i]); k++) await (steps[i] > 0 ? up : down).click();
      if (i === 2) {
        // a slip first: 30 mV on the steep fall is marked wrong
        await down.click();
        await check.click();
        await expect(readout).toContainText('נכונות 2 מתוך 4');
        await up.click();
      }
      if (i < steps.length - 1) await next.click();
    }
    await check.click();
    await expect(readout).toContainText('כל המדרגות נכונות');
    expect((await progress(page)).tasks['fig-5-6b:build-flux']).toBeTruthy();
  });

  test('bell: at the peak of the flux the emf is zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-6b');
    await fig.getByRole('button', { name: 'מגנט עובר בסליל' }).click();
    const readout = fig.locator('.sim-readout');
    const cursor = fig.locator('input[type=range]').first();
    for (const t of [1, 2, 3]) await setSlider(cursor, t);
    await expect(readout).toContainText('ε = 0 V');
    expect((await progress(page)).tasks['fig-5-6b:bell-peak']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-6"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'אותו מטען בשתי הפעמים' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the side along the motion is told apart, then Bhv passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.6-strip-emf"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.72');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הצלע שלאורך התנועה');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.24');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "a loop moving in a field always carries a current" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.6-strip-inside"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'זורם זרם קבוע, כי הלולאה נעה' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.6-strip-inside', correct: false, confident: true, misconception: 'MC-strip-current-inside-field' });
  });
});
