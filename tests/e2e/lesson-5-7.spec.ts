import { expect, test, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-7/';

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

const noSideScroll = async (page: Page) => {
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

  test('inside the core the emf follows the area; round the whole core it stops growing', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-7a');
    const readout = fig.locator('.sim-readout');
    // a loop of radius 2 cm in a 2 T/s core: π·0.02²·2 = 2.51·10⁻³ V, clockwise for a growing ⊙ field
    await expect(readout).toContainText('12.6 cm²');
    await expect(readout).toContainText('2.51·10⁻³ V, עם כיוון השעון');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // space selects the loop, a second space the rim handle; an arrow grows the radius by 5 mm
    await canvas.press(' ');
    await canvas.press(' ');
    await canvas.press('ArrowRight');
    await expect(readout).toContainText('3.93·10⁻³ V');
    expect((await progress(page)).tasks['fig-5-7a:inside-area']).toBeTruthy();
    // 2.5 cm + 4 × 2 cm = 10.5 cm: the loop now holds the whole core, π·0.04²·2 = 0.0101 V
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('0.0101 V');
    await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('0.0101 V');
    expect((await progress(page)).tasks['fig-5-7a:enclose']).toBeTruthy();
    await noSideScroll(page);
  });

  test('a loop beside the core has zero emf, though the field on it is not zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-7a');
    const readout = fig.locator('.sim-readout');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press(' ');
    for (let i = 0; i < 5; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('0 V');
    await expect(readout).toContainText('בחלק ממנה הוא דוחף עם כיוון השעון ובחלק נגדו');
    expect((await progress(page)).tasks['fig-5-7a:beside']).toBeTruthy();
  });

  test('a shrinking field reverses the induced field', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-7a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'קטן', exact: true }).click();
    await expect(readout).toContainText('2.51·10⁻³ V, נגד כיוון השעון');
    expect((await progress(page)).tasks['fig-5-7a:reverse']).toBeTruthy();
    // ⊗ shrinking is ⊙ growing again: clockwise
    await fig.getByRole('button', { name: /השדה:/ }).click();
    await expect(readout).toContainText('2.51·10⁻³ V, עם כיוון השעון');
  });

  test('a released bead gains q|ε| on each lap', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-7a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'שחררו חרוז טעון' }).click();
    expect((await progress(page)).tasks['fig-5-7a:bead']).toBeTruthy();
    // the first lap takes about 2.4 s of figure time
    await expect(readout).toContainText('1·q|ε|', { timeout: 15_000 });
    await noSideScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-7"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'יגדל פי 4' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the inside formula used outside the core gets targeted feedback, then 5 mV/m passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.7-E-outside"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('80');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('תוך הליבה');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the magnetic force pushes them" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.7-what-pushes"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'הכוח המגנטי, כוח לורנץ' }).click();
    await q.locator('.reasons label', { hasText: 'מפעיל כוח מגנטי גם על מטענים במנוחה' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.7-what-pushes', correct: false, confident: true, misconception: 'MC-induced-lorentz-at-rest' });
  });
});
