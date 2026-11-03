import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-14/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open the figure with motion off, so the wave stays at t = 0 and every readout is deterministic. */
async function openFigure(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-14a');
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

  test('at a crest of E the probe reads B at its largest too, E = cB, and u_E = u_B', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    // 100 MHz: λ = 3 m, speed c
    await expect(readout).toContainText('λ = 3 m');
    await expect(readout).toContainText('ω/k = 3·10⁸ m/s');
    // x = 0.75 m = λ/4 at t = 0: E = E₀ = 30 V/m, B = E₀/c = 100 nT, u = ε₀E₀²/2, S = E₀B₀/μ₀
    await setSlider(fig.getByRole('slider', { name: 'מקום הגשש' }), 0.75);
    await expect(readout).toContainText('E = 30 V/m');
    await expect(readout).toContainText('B = 100 nT');
    await expect(readout).toContainText('cB = 30 V/m');
    await expect(readout).toContainText('u_E = 3.98·10⁻⁹ J/m³');
    await expect(readout).toContainText('u_B = 3.98·10⁻⁹ J/m³');
    await expect(readout).toContainText('S = 2.39 W/m²');
    await expect(readout).toContainText('⟨S⟩ = 1.19 W/m²');
    expect((await progress(page)).tasks['fig-6-14a:in-phase']).toBeTruthy();
    // half a wavelength on, E = 0, and so is B
    await setSlider(fig.getByRole('slider', { name: 'מקום הגשש' }), 1.5);
    await expect(readout).toContainText('E = 0 V/m');
    await expect(readout).toContainText('B = 0 nT');
    expect((await progress(page)).tasks['fig-6-14a:energy']).toBeTruthy();
    await noSidewaysScroll(page);
  });

  test('doubling the frequency halves the wavelength and leaves the speed at c', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.getByRole('slider', { name: 'התדירות' }), 200);
    await expect(readout).toContainText('λ = 1.5 m');
    await expect(readout).toContainText('ω/k = 3·10⁸ m/s');
    expect((await progress(page)).tasks['fig-6-14a:speed']).toBeTruthy();
  });

  test('flipping B sends the wave the other way: S points along −x', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.getByRole('slider', { name: 'מקום הגשש' }), 0.75);
    await expect(readout).toContainText('ימינה, בכיוון +x');
    await fig.getByRole('button', { name: 'הפכו את כיוון B' }).click();
    await expect(readout).toContainText('E = 30 V/m');
    await expect(readout).toContainText('B = -100 nT');
    await expect(readout).toContainText('שמאלה, בכיוון −x');
    expect((await progress(page)).tasks['fig-6-14a:flip']).toBeTruthy();
  });

  test('a trial wave keeps Faraday but breaks Ampère–Maxwell until its speed is c; a lagging B breaks both', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout.locator('span', { hasText: 'חוק אמפר-מקסוול' })).toContainText('מתקיים בכל נקודה');
    await fig.getByRole('button', { name: 'גל ניסיוני' }).click();
    await expect(readout).toContainText('ω/k = 2.1·10⁸ m/s');
    await expect(readout.locator('span', { hasText: 'חוק פאראדיי' })).toContainText('מתקיים בכל נקודה');
    // left kB₀ = kE₀/v, right μ₀ε₀ωE₀: they differ by 1 − (v/c)² = 51% of the larger
    await expect(readout.locator('span', { hasText: 'חוק אמפר-מקסוול' })).toContainText('לא מתקיים: הפער מגיע ל-51%');
    const speed = fig.getByRole('slider', { name: 'מהירות הגל הניסיוני (ביחידות של c)' });
    await setSlider(speed, 1);
    await expect(readout.locator('span', { hasText: 'חוק אמפר-מקסוול' })).toContainText('מתקיים בכל נקודה');
    expect((await progress(page)).tasks['fig-6-14a:find-c']).toBeTruthy();
    await fig.getByRole('button', { name: 'B בפיגור של רבע מחזור' }).click();
    await expect(readout.locator('span', { hasText: 'חוק פאראדיי' })).toContainText('לא מתקיים');
    await expect(readout.locator('span', { hasText: 'חוק אמפר-מקסוול' })).toContainText('לא מתקיים');
    await expect(readout).toContainText('⟨S⟩ = 0 W/m²');
    expect((await progress(page)).tasks['fig-6-14a:lag']).toBeTruthy();
    await noSidewaysScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-14"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'השדות מתחלפים' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: forgetting the ½ of the time average gets targeted feedback, then 1940 V/m passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.14-laser"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1372');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('החצי');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1940');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the magnetic share is negligible" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.14-shares"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'חלק זניח' }).click();
    await q.locator('.reasons label', { hasText: 'קטן מאוד בטסלה' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.14-shares', correct: false, confident: true, misconception: 'MC-magnetic-energy-negligible' });
    await noSidewaysScroll(page);
  });
});
