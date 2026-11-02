import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-1/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** the step slider runs from the smallest step (0.001, value 0) to the largest; 0.01 is value 3 */
const STEP_0_01 = 3;
const STEP_0_001 = 0;

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

  test('free fall: the chord slope closes in on v = 10 m/s from the right and from the left', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-1a');
    const secant = fig.locator('[data-readout="secant"]');
    await expect(secant).toContainText('15 m/s');
    const step = fig.locator('input[type=range]').nth(1);
    await setSlider(step, STEP_0_01);
    await expect(secant).toContainText('10.05 m/s');
    await setSlider(step, STEP_0_001);
    await expect(secant).toContainText('10.005 m/s');
    expect((await progress(page)).tasks['fig-6-1a:shrink']).toBeTruthy();
    await fig.getByRole('button', { name: 'Q משמאל ל-P' }).click();
    await expect(secant).toContainText('9.995 m/s');
    expect((await progress(page)).tasks['fig-6-1a:left']).toBeTruthy();
    await fig.getByRole('button', { name: 'משיק', exact: true }).click();
    await expect(fig.locator('[data-readout="tangent"]')).toContainText('10 m/s');
    await expect(fig.locator('[data-readout="rate"]')).toContainText('v = dx/dt = 10 m/s');
    await fig.getByRole('button', { name: 'זכוכית מגדלת' }).click();
    await noSideways(page);
  });

  test('y = x³ at x = 2: the chord slope approaches 3·2² = 12', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-1b');
    await fig.getByRole('button', { name: 'y = x³' }).click();
    await setSlider(fig.locator('input[type=range]').nth(0), 2);
    await setSlider(fig.locator('input[type=range]').nth(1), STEP_0_01);
    await expect(fig.locator('[data-readout="secant"]')).toContainText('12.06');
    expect((await progress(page)).tasks['fig-6-1b:cube-slope']).toBeTruthy();
  });

  test('sin: the tangent is level at π/2, where sin is largest; the potential gives E = 9 N/C at 1 m', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-1b');
    await fig.getByRole('button', { name: 'y = sin x' }).click();
    await fig.getByRole('button', { name: 'משיק', exact: true }).click();
    await expect(fig.locator('[data-readout="tangent"]')).toContainText('dy/dx = 1');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 6; i++) await canvas.press('ArrowRight');
    await expect(fig.locator('[data-readout="tangent"]')).toContainText('dy/dx = 0');
    expect((await progress(page)).tasks['fig-6-1b:sin-flat']).toBeTruthy();
    await fig.getByRole('button', { name: 'פוטנציאל של מטען' }).click();
    await expect(fig.locator('[data-readout="tangent"]')).toContainText('−9 V/m');
    await expect(fig.locator('[data-readout="rate"]')).toContainText('E = −dV/dr = 9 N/C');
  });

  test('chain rule and discharge: the oscillator starts at Aω = 1 m/s; the tangent at t = 0 meets the axis at τ', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-1c');
    await setSlider(fig.locator('input[type=range]').nth(1), STEP_0_01);
    await expect(fig.locator('[data-readout="secant"]')).toContainText('0.99993 m/s');
    expect((await progress(page)).tasks['fig-6-1c:osc-start']).toBeTruthy();
    await fig.getByRole('button', { name: 'פריקת קבל' }).click();
    await fig.getByRole('button', { name: 'משיק', exact: true }).click();
    await expect(fig.locator('[data-readout="rate"]')).toContainText('I = −dq/dt = 0.6 mA');
    await expect(fig.locator('.sim-readout')).toContainText('t = 2 s');
    expect((await progress(page)).tasks['fig-6-1c:rc-tau']).toBeTruthy();
    await noSideways(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-1"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'לא ישתנה' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: forgetting the chain rule’s 1/τ gets targeted feedback, then 4 mA passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.1-rc-current"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('כלל השרשרת מוסיף');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.1-rc-current', correct: false, misconception: 'MC-chain-rule-forgotten' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSideways(page);
  });

  test('a confident "the slope at the top of sin is 1" is recorded as value-for-slope', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.1-sin-top"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'הכי גדול' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.1-sin-top', correct: false, confident: true, misconception: 'MC-derivative-value-not-slope' });
  });
});
