import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-8/';

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

  test('10 A and 10 A at 10 cm attract with 2·10⁻⁴ N/m; flipping one current makes them repel', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-8a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('B₁ = 2·10⁻⁵ T');
    await expect(readout).toContainText('F₂/L = 2·10⁻⁴ N/m');
    await expect(readout).toContainText('נמשכים');
    await setSlider(fig.locator('input[type=range]').nth(1), -10);
    await expect(readout).toContainText('נדחים');
    await expect(readout).toContainText('F₁/L = 2·10⁻⁴ N/m (שמאלה)');
    expect((await progress(page)).tasks['fig-4-8a:flip']).toBeTruthy();
    await noSideScroll(page);
  });

  test('unequal currents: both wires feel the same force (Newton’s third law)', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-8a');
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').nth(1), 20);
    await expect(readout).toContainText('F₂/L = 4·10⁻⁴ N/m');
    await expect(readout).toContainText('F₁/L = 4·10⁻⁴ N/m');
    expect((await progress(page)).tasks['fig-4-8a:unequal']).toBeTruthy();
  });

  test('doubling the distance halves the force (1/d, not 1/d²)', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-8a');
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').nth(2), 20);
    await expect(readout).toContainText('d = 20 cm');
    await expect(readout).toContainText('F₂/L = 1·10⁻⁴ N/m');
    expect((await progress(page)).tasks['fig-4-8a:double-d']).toBeTruthy();
  });

  test('three in a row: the middle wire feels 4·10⁻⁴ N/m, and it cancels when the third current turns round', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-8b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('F₂/L = 4·10⁻⁴ N/m (שמאלה)');
    await expect(readout).toContainText('F₁/L = 1·10⁻⁴ N/m (ימינה)');
    await expect(readout).toContainText('F₃/L = 3·10⁻⁴ N/m (ימינה)');
    await setSlider(fig.locator('input[type=range]').nth(2), 10);
    await expect(readout).toContainText('F₂/L = 0 N/m');
    expect((await progress(page)).tasks['fig-4-8b:balance']).toBeTruthy();
  });

  test('the triangle pulls every wire to the centre; turning one current pushes that wire out', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-8b');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'משולש' }).click();
    await expect(readout).toContainText('F₃/L = 3.46·10⁻⁴ N/m (למטה)');
    await setSlider(fig.locator('input[type=range]').nth(2), -10);
    await expect(readout).toContainText('F₃/L = 3.46·10⁻⁴ N/m (למעלה)');
    expect((await progress(page)).tasks['fig-4-8b:triangle-flip']).toBeTruthy();
    await noSideScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-8"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'כמו שני מטענים חיוביים' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: dividing by d² is caught as that misconception, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.8-force-per-length"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.02');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.8-force-per-length', correct: false, misconception: 'MC-parallel-wires-inverse-square', lesson: '4.8' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('6e-4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "like currents repel" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.8-same-direction"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'הם יתרחקו זה מזה' }).click();
    await q.locator('.reasons label', { hasText: 'זרמים זהים הם כמו מטענים זהים' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.8-same-direction', correct: false, confident: true, misconception: 'MC-like-currents-repel', lesson: '4.8' });
  });
});
