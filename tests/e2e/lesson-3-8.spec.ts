import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-8/';

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

  test('the figure draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const c = page.locator('.sim-stage canvas').first();
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test('2 A in, 1 A + 1 A out; past 8 V the second battery stops charging and delivers', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-8a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('A₁: מראה 2 A');
    await expect(readout).toContainText('A₂: מראה 1 A');
    await expect(readout).toContainText('A₃: מראה 1 A');
    await fig.getByRole('button', { name: 'הלולאה הימנית' }).click();
    // every value a drag passes, as a real slider fires them
    const slider = fig.locator('input[type=range]').first();
    for (const v of [4.5, 6, 7.5]) await setSlider(slider, v);
    await expect(readout).toContainText('A₂: מראה 0.1 A');
    expect((await progress(page)).tasks['fig-3-8a:eps2-delivers']).toBeFalsy();
    await setSlider(slider, 9);
    await expect(readout).toContainText('A₂: מראה 0.2 A');
    const tasks = (await progress(page)).tasks;
    for (const t of ['loop-right', 'eps2-delivers']) expect(tasks[`fig-3-8a:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-8"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'זרם נכנס להדק החיובי שלה' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: dropping the minus sign is caught as "a negative current is a mistake", then −0.5 passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.8-solve-i2"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.8-solve-i2', correct: false, misconception: 'MC-negative-current-mistake', lesson: '3.8' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('-0.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "all the voltages add" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.8-loop-sign"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: '+ IR_1 + IR_2' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.8-loop-sign', correct: false, confident: true, misconception: 'MC-loop-all-add' });
  });
});
