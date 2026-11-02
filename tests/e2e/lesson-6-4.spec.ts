import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-4/';

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

const noSideways = async (page: Page) => {
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

  test('the three figures draw, in LTR physics space', async ({ page }) => {
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

  test('rod: the sum of N point charges converges to the integral as N grows', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-4a');
    const readout = fig.locator('.sim-readout');
    // 4 pieces of a 40 cm rod, P at (6 cm, 8 cm): 2150 N/C against the exact 2060 N/C
    await expect(readout).toContainText('E = 2150 N/C');
    await expect(readout).toContainText('E = 2060 N/C');
    await expect(readout).toContainText('4.5%');
    await setSlider(fig.locator('input[type=range]').first(), 40);
    await expect(readout).toContainText('E = 2060 N/C');
    await expect(readout).toContainText('פחות מ-0.1%');
    // close to the rod (3 cm): the task needs the sum within 1% there
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 5; i++) await canvas.press('ArrowDown');
    await expect(readout).toContainText('E = 5920 N/C');
    expect((await progress(page)).tasks['fig-6-4a:rod-converge']).toBeTruthy();
    await noSideways(page);
  });

  test('rod limits: a long rod seen from close is an infinite line', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-4a');
    await setSlider(fig.locator('input[type=range]').nth(1), 1.2);
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // P from (6, 8) cm to (0, 3) cm
    for (let i = 0; i < 6; i++) await canvas.press('ArrowLeft');
    for (let i = 0; i < 5; i++) await canvas.press('ArrowDown');
    expect((await progress(page)).tasks['fig-6-4a:rod-line']).toBeTruthy();
  });

  test('ring: at the centre the chain of arrows closes and the field is zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-4a');
    await fig.getByRole('button', { name: 'טבעת', exact: true }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('z = 15 cm');
    await expect(readout).toContainText('E = 922 N/C');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 30; i++) await canvas.press('ArrowLeft');
    await expect(readout).toContainText('z = 0 cm');
    await expect(readout).toContainText('E = 0 N/C');
    expect((await progress(page)).tasks['fig-6-4a:ring-centre']).toBeTruthy();
  });

  test('ring: the axial field peaks at R/√2, not at the centre', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-4b');
    const readout = fig.locator('.sim-readout');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // 15 cm → 7 cm in steps of 0.5 cm
    for (let i = 0; i < 16; i++) await canvas.press('ArrowLeft');
    await expect(readout).toContainText('z = 7 cm');
    await expect(readout).toContainText('E = 1390 N/C');
    expect((await progress(page)).tasks['fig-6-4b:ring-peak']).toBeTruthy();
  });

  test('disc: more rings bring the sum to the closed form', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-4c');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('E = 4420 N/C');
    await expect(readout).toContainText('E = 3980 N/C');
    await expect(readout).toContainText('7200 N/C');
    await setSlider(fig.locator('input[type=range]').first(), 30);
    await expect(readout).toContainText('פחות מ-0.1%');
    expect((await progress(page)).tasks['fig-6-4c:disc-converge']).toBeTruthy();
    await noSideways(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-4"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'במרכז הטבעת' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: adding magnitudes without cos θ gets targeted feedback, then 1200 N/C passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.4-ring-axis"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('2000');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הרכיבים הניצבים לציר מתבטלים');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1200');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSideways(page);
  });

  test('a confident "the field is strongest at the ring centre" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.4-ring-centre"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'השדה החזק ביותר על הציר' }).click();
    await q.locator('.reasons label', { hasText: 'במרכז כל המטען הכי קרוב' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.4-ring-centre', correct: false, confident: true, misconception: 'MC-ring-centre-max' });
  });
});
