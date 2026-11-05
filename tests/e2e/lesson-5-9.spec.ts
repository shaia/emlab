import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-9/';
const WORLD_W = 0.24; // MaxwellFour's world width [m]; the canvas centre is the origin

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

/** click the canvas at a world point [m] */
async function clickWorld(fig: Locator, x: number, y: number) {
  const canvas = fig.locator('.sim-stage canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  const ppm = box.width / WORLD_W;
  await canvas.click({ position: { x: box.width / 2 + x * ppm, y: box.height / 2 - y * ppm } });
}

const noSideScroll = async (page: Page) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sw).toBeLessThanOrEqual(0);
};

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

  test('both figures draw, in LTR physics space', async ({ page }) => {
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

  test('Gauss: 452 N·m²/C around +4 nC; a sphere round both charges is bigger and carries less, 226', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-9a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('∮E·dA = 452 N·m²/C');
    await expect(readout).toContainText('Q_in/ε₀ = 452 N·m²/C');
    await clickWorld(fig, 0, 0);
    await setSlider(fig.locator('input[type=range]').first(), 0.08);
    await expect(readout).toContainText('∮E·dA = 226 N·m²/C');
    await expect(readout).toContainText('Q_in = +2 nC');
    expect((await progress(page)).tasks['fig-5-9a:gauss-both']).toBeTruthy();
  });

  test('Gauss for B: a cube round the north pole lets out what it lets in, net zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-9a');
    await fig.locator('[data-law="gauss-b"]').click();
    await expect(fig.locator('[data-law="gauss-b"]')).toHaveAttribute('aria-pressed', 'true');
    await clickWorld(fig, 0, 0.05);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('∮B·dA = 0 Wb');
    await expect(readout).toContainText('השטף שיוצא: 7.36·10⁻⁷ Wb');
    await expect(readout).toContainText('השטף שנכנס: 7.36·10⁻⁷ Wb');
    expect((await progress(page)).tasks['fig-5-9a:b-pole']).toBeTruthy();
  });

  test('Faraday: B growing turns E clockwise; shrinking turns it back; beyond the core the sum stops growing', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-9a');
    await fig.locator('[data-law="faraday"]').click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('∮E·dl = -5.65·10⁻³ V');
    await expect(readout).toContainText('−ΔΦ_B/Δt = -5.65·10⁻³ V');
    await expect(readout).toContainText('עם כיוון השעון');
    const [rate, radius] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
    for (const v of [1.5, 1, 0.5, 0, -0.5, -1]) await setSlider(rate, v);
    await expect(readout).toContainText('∮E·dl = 2.83·10⁻³ V');
    await expect(readout).toContainText('נגד כיוון השעון');
    await setSlider(radius, 0.06);
    await expect(readout).toContainText('∮E·dl = 5.03·10⁻³ V');
    await setSlider(radius, 0.075);
    await expect(readout).toContainText('∮E·dl = 5.03·10⁻³ V');
    const tasks = (await progress(page)).tasks;
    for (const t of ['faraday-shrink', 'faraday-beyond']) expect(tasks[`fig-5-9a:${t}`]).toBeTruthy();
  });

  test('Ampère–Maxwell: the bag breaks the old law, Maxwell’s term mends it, and B lives in the gap', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-9a');
    await fig.locator('[data-law="ampere"]').click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('∮B·dl = 2.51·10⁻⁶ T·m');
    await expect(readout).toContainText('שווה לצד שמאל');
    await fig.getByRole('button', { name: 'שקית בין הלוחות' }).click();
    await expect(readout).toContainText('μ₀I = 0 T·m');
    await expect(readout).toContainText('שונה מצד שמאל');
    await fig.getByRole('button', { name: 'התוספת של מקסוול' }).click();
    await expect(readout).toContainText('μ₀(I + ε₀ΔΦ_E/Δt) = 2.51·10⁻⁶ T·m');
    await expect(readout).toContainText('שווה לצד שמאל');
    await fig.getByRole('button', { name: 'המסלול בין הלוחות' }).click();
    await expect(readout).toContainText('B = 4.8·10⁻⁶ T');
    await expect(readout).toContainText('I = 0 A');
    await expect(readout).toContainText('ε₀·ΔΦ_E/Δt = 0.72 A');
    const tasks = (await progress(page)).tasks;
    for (const t of ['ampere-bag', 'ampere-fix', 'ampere-gap']) expect(tasks[`fig-5-9a:${t}`]).toBeTruthy();
    await noSideScroll(page);
  });

  test('the wave: 3 m at 100 MHz, c from the constants at every frequency, light and the grid', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-9b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('λ = c/f = 3 m');
    await expect(readout).toContainText('c = 1/√(μ₀ε₀) = 3·10⁸ m/s');
    await fig.getByRole('button', { name: 'אור ירוק' }).click();
    await expect(readout).toContainText('אור נראה');
    await expect(readout).toContainText('536 nm');
    await expect(readout).toContainText('c = 1/√(μ₀ε₀) = 3·10⁸ m/s');
    await fig.getByRole('button', { name: 'רשת החשמל' }).click();
    await expect(readout).toContainText('6000 km');
    const tasks = (await progress(page)).tasks;
    for (const t of ['wave-light', 'wave-grid']) expect(tasks[`fig-5-9b:${t}`]).toBeTruthy();
    await noSideScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-9"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'אין שם שדה מגנטי' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the whole ring area is told apart, then the core area passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.9-faraday-big-loop"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('50.3');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('כל הטבעת');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.14');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "strongest when full" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.9-full-capacitor"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'הכי חזק שהיה' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.9-full-capacitor', correct: false, confident: true, misconception: 'MC-displacement-follows-field' });
  });
});
