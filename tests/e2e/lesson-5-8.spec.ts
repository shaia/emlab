import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-8/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-5-8a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
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

  test('the figure draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(1);
    const c = canvases.first();
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test('the emf is largest where the flux is zero, and zero where the flux is largest', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    // the starting state: θ = ωt = 60°, 200 turns of 40 cm², 0.5 T, one turn per second
    await expect(readout).toContainText('θ = ωt = 60°');
    await expect(readout).toContainText('Φ = BA·cosθ = 1 mWb');
    await expect(readout).toContainText('ε = NBAω·sinθ = 2.18 V');
    await expect(readout).toContainText('ε₀ = NBAω = 2.51 V');
    const turn = fig.locator('input[type=range]').first();
    await setSlider(turn, 90);
    await expect(readout).toContainText('Φ = BA·cosθ = 0 mWb');
    await expect(readout).toContainText('ε = NBAω·sinθ = 2.51 V');
    await setSlider(turn, 0);
    await expect(readout).toContainText('Φ = BA·cosθ = 2 mWb');
    await expect(readout).toContainText('ε = NBAω·sinθ = 0 V');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-5-8a:emf-max']).toBeTruthy();
    expect(tasks['fig-5-8a:emf-zero']).toBeTruthy();
  });

  test('twice the speed: twice the peak, half the period; twice the turns: four times the mean power', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    const sliders = fig.locator('input[type=range]');
    await expect(readout).toContainText('T = 1/f = 1 s');
    await expect(readout).toContainText('ε₀²/(2R) = 0.316 W');
    await setSlider(sliders.nth(1), 2);
    await expect(readout).toContainText('ε₀ = NBAω = 5.03 V');
    await expect(readout).toContainText('T = 1/f = 0.5 s');
    await setSlider(sliders.nth(1), 1);
    await setSlider(sliders.nth(2), 400);
    await expect(readout).toContainText('ε₀ = NBAω = 5.03 V');
    await expect(readout).toContainText('ε₀²/(2R) = 1.26 W');
    await expect(readout).toContainText('ε₀/√2 = 3.55 V');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-5-8a:double-f']).toBeTruthy();
    expect(tasks['fig-5-8a:double-n']).toBeTruthy();
  });

  test('the split ring turns the negative half of the emf positive', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').first(), 300);
    // the readout shows the whole turn, so the sign of sin 300° matches the emf beside it
    await expect(readout).toContainText('θ = ωt = 300°');
    await expect(readout).toContainText('ε = NBAω·sinθ = -2.18 V');
    await fig.getByRole('button', { name: 'טבעת מפוצלת' }).click();
    await expect(readout).toContainText('|ε| = 2.18 V');
    expect((await progress(page)).tasks['fig-5-8a:split']).toBeTruthy();
  });

  test('in still mode the generator does not turn by itself', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('emlab:settings', JSON.stringify({ still: true, theme: 'auto' })));
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'סובבו את הגנרטור' }).click();
    await page.waitForTimeout(800);
    await expect(fig.locator('.sim-readout')).toContainText('θ = ωt = 60°');
    await expect(fig.getByRole('button', { name: 'סובבו את הגנרטור' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('running, the coil turns and the readout follows it', async ({ page }) => {
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'סובבו את הגנרטור' }).click();
    await expect.poll(async () => (await fig.locator('.sim-readout').textContent()) ?? '', { timeout: 10_000 }).not.toContain('θ = ωt = 60°');
    await fig.getByRole('button', { name: 'עצרו' }).click();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-8"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await hydrated(predict.locator('label.q-choice').first());
    await predict.locator('label.q-choice', { hasText: 'השטף דרכו הכי גדול' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the peak power is caught as a misconception, then the mean power 40 W passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.8-mean-power"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('80');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.8-mean-power', correct: false, misconception: 'MC-ac-mean-power-peak-squared', lesson: '5.8' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('40');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "largest when the flux is largest" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.8-max-emf-position"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'והשטף דרכו הגדול ביותר' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.8-max-emf-position', correct: false, confident: true, misconception: 'MC-generator-emf-follows-flux' });
  });
});
