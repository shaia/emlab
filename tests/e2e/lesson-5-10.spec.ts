import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-10/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-5-10a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const noSideScroll = async (page: Page) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sw).toBeLessThanOrEqual(0);
};

/** E/E₀ and B/B₀ as the readout prints them under the probe */
async function probeReading(readout: Locator): Promise<{ E: number; B: number } | null> {
  const text = (await readout.textContent()) ?? '';
  const m = /E = (−?\d\.\d\d)·E₀.*?B = (−?\d\.\d\d)·B₀/.exec(text);
  if (!m) return null;
  const num = (s: string) => Number(s.replace('−', '-'));
  return { E: num(m[1]), B: num(m[2]) };
}

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

  test('the wave draws in LTR physics space, under the two laws that remain in vacuum', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(1);
    const c = canvases.first();
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
    await expect(page.locator('#fig-5-10a [data-law]')).toHaveCount(1);
    await expect(page.locator('#fig-5-10a [data-law="wave"] [data-side]')).toHaveCount(4);
  });

  test('the probe: where E is near its peak B is too, and the two always read the same fraction', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    const canvas = fig.locator('.sim-stage canvas');
    await canvas.focus();
    await page.keyboard.press('ArrowRight'); // stops the wave and puts the probe in the middle
    await expect(readout).toContainText('בגשש');
    let peak = false;
    for (let i = 0; i < 48 && !peak; i++) {
      const r = await probeReading(readout);
      expect(r).not.toBeNull();
      expect(r!.B).toBeCloseTo(r!.E, 2);
      if (Math.abs(r!.E) >= 0.9) peak = true;
      else await page.keyboard.press('ArrowRight');
    }
    expect(peak).toBe(true);
    expect((await progress(page)).tasks['fig-5-10a:wave-peak']).toBeTruthy();
    // a click elsewhere moves the probe; the wave stays stopped
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.36 } });
    const r = await probeReading(readout);
    expect(r!.B).toBeCloseTo(r!.E, 2);
    await expect(fig.getByRole('button', { name: 'עצירת הגל' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('3 m at 100 MHz; c from the constants at every frequency; light, the grid, and three bands', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('λ = c/f = 3 m');
    await expect(readout).toContainText('c = 1/√(μ₀ε₀) = 3·10⁸ m/s');
    await fig.getByRole('button', { name: 'אור ירוק' }).click();
    await expect(readout).toContainText('אור נראה');
    await expect(readout).toContainText('536 nm');
    await expect(readout).toContainText('c = 1/√(μ₀ε₀) = 3·10⁸ m/s');
    await fig.getByRole('button', { name: 'רשת החשמל' }).click();
    await expect(readout).toContainText('6000 km');
    const slider = fig.locator('input[type=range]').first();
    for (const v of [9.5, 13, 18]) await setSlider(slider, v);
    await expect(readout).toContainText('קרני רנטגן');
    await expect(readout).toContainText('c = 1/√(μ₀ε₀) = 3·10⁸ m/s');
    const tasks = (await progress(page)).tasks;
    for (const t of ['wave-light', 'wave-grid', 'wave-bands']) expect(tasks[`fig-5-10a:${t}`]).toBeTruthy();
    await noSideScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-10"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'גם הוא בשיא' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the one-way time is told apart, then the round trip passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.10-moon-delay"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1.28');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('בכיוון אחד');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2.56');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "charges fly from the Sun" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.10-what-travels"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'מטענים חשמליים שעפים' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.10-what-travels', correct: false, confident: true, misconception: 'MC-em-wave-carries-charge' });
  });
});
