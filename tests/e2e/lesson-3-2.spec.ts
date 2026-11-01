import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-2/';

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

  test('copper drifts at 7.35·10⁻⁵ m/s at 1 A in 1 mm²: slower in a thicker wire, faster at more current', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-2a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'סגרו את המעגל' }).click();
    await expect(readout).toContainText('7.35·10⁻⁵ m/s');
    await expect(readout).toContainText('3.8 שעות');
    const sliders = fig.locator('input[type=range]');
    await setSlider(sliders.nth(1), 2);
    await expect(readout).toContainText('3.68·10⁻⁵ m/s');
    await setSlider(sliders.nth(0), 2);
    await expect(readout).toContainText('7.35·10⁻⁵ m/s');
    const tasks = (await progress(page)).tasks;
    for (const t of ['field-on', 'thick-wire', 'more-current']) expect(tasks[`fig-3-2a:${t}`]).toBeTruthy();
  });

  test('the ammeters before and after the bulb always agree', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-2b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('A₁: מראה 0 A');
    await fig.getByRole('button', { name: 'סגרו את S' }).click();
    await expect(readout).toContainText('A₁: מראה 2 A');
    await expect(readout).toContainText('A₂: מראה 2 A');
    await fig.getByRole('button', { name: 'הראו את האלקטרונים' }).click();
    await setSlider(fig.locator('input[type=range]').first(), 6);
    await expect(readout).toContainText('A₁: מראה 1 A');
    await expect(readout).toContainText('A₂: מראה 1 A');
    const tasks = (await progress(page)).tasks;
    for (const t of ['close-switch', 'electrons', 'change-emf']) expect(tasks[`fig-3-2b:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-2"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'הרבה שעות' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: "the bulb uses up the current" is caught as that misconception, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.2-ammeters"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.2-ammeters', correct: false, misconception: 'MC-current-used-up', lesson: '3.2' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.8');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "current flows the way the electrons go" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.2-conventional-direction"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'גם הזרם וגם האלקטרונים מההדק השלילי' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.2-conventional-direction', correct: false, confident: true, misconception: 'MC-electron-direction' });
  });
});
