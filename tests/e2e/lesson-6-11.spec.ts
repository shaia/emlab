import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-11/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

const slider = (fig: Locator, label: string) => fig.locator('label.slider', { hasText: label }).locator('input');

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

const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

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

  test('a short wire: more pieces converge to the integral, which is 78% of the infinite wire', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-11a');
    const readout = fig.locator('.sim-readout');
    // one piece at the middle overestimates: μ₀IL/(4πs²) = 62.5 μT
    await expect(readout).toContainText('B = 62.5 μT');
    await expect(readout).toContainText('= 39 μT');
    await expect(readout).toContainText('μ₀I/(2πs) = 50 μT');
    await expect(readout).toContainText('78%');
    await setSlider(slider(fig, 'מספר החתיכות'), 6);
    await expect(readout).toContainText('B = 39.2 μT');
    expect((await progress(page)).tasks['fig-6-11a:converge']).toBeTruthy();
  });

  test('lengthening the wire reaches 95% of μ₀I/(2πs); opposite its end, half', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-11a');
    const readout = fig.locator('.sim-readout');
    await setSlider(slider(fig, 'מספר החתיכות'), 30);
    await setSlider(slider(fig, 'אורך התיל'), 0.3);
    await expect(readout).toContainText('97%');
    expect((await progress(page)).tasks['fig-6-11a:lengthen']).toBeTruthy();
    // P from the middle to the right end (15 cm): shift+arrow moves it 2 cm, an arrow 5 mm
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 7; i++) await canvas.press('Shift+ArrowRight');
    await canvas.press('ArrowRight');
    await canvas.press('ArrowRight');
    await expect(readout).toContainText('50%');
    expect((await progress(page)).tasks['fig-6-11a:end-half']).toBeTruthy();
    await noSidewaysScroll(page);
  });

  test('a loop far along its axis is a dipole; a solenoid of 20 turns reaches 95% of μ₀nI', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-11b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('μ₀IR²/(2(R²+z²)³ᐟ²) = 33 μT');
    await setSlider(slider(fig, 'רדיוס הכריכה'), 0.03);
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // z from 6 cm to 12 cm = 4R
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('z/R = 4');
    await expect(readout).toContainText('91%');
    expect((await progress(page)).tasks['fig-6-11b:dipole']).toBeTruthy();

    await fig.getByRole('button', { name: 'סליל', exact: true }).click();
    await expect(readout).toContainText('μ₀nI = 314 μT');
    await expect(readout).toContainText('79%');
    await setSlider(slider(fig, 'מספר הכריכות'), 20);
    await expect(readout).toContainText('95%');
    expect((await progress(page)).tasks['fig-6-11b:long-solenoid']).toBeTruthy();
    await noSidewaysScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-11"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'פחות מ-50 מיקרוטסלה' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the infinite-wire value gets targeted feedback, then 16.6 μT passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.11-segment-calc"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('20');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('תיל אינסופי');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('16.6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSidewaysScroll(page);
  });

  test('a confident "the long-wire formula holds for any wire" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.11-short-wire"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'כן: זו הנוסחה של תיל ישר' }).click();
    await q.locator('.reasons label', { hasText: 'הנוסחה של תיל נכונה לכל תיל ישר' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.11-short-wire', correct: false, confident: true, misconception: 'MC-short-wire-infinite-formula' });
  });
});
