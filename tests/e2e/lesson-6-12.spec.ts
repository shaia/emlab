import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-12/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-12a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const noSidewaysScroll = async (page: Page) => {
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

  test('the paradox: the bag carries no conduction current, and the old law contradicts the circulation', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    // t = 0.5τ: I = (12 V / 10 kΩ)·e^(−0.5), B = μ₀I/(2π·6 cm), ∮B·dl = μ₀I
    await expect(readout).toContainText('I = 0.728 mA');
    await expect(readout).toContainText('B = 2.43 nT');
    await expect(readout).toContainText('∮B·dl = 9.15·10⁻¹⁰ T·m');
    await expect(readout).toContainText('שווה לסירקולציה');
    await fig.getByRole('button', { name: 'שקית בין הלוחות' }).click();
    await expect(readout).toContainText('Ic = 0 mA');
    await expect(readout).toContainText('Id = 0.728 mA');
    await expect(readout).toContainText('סתירה');
    expect((await progress(page)).tasks['fig-6-12a:paradox']).toBeTruthy();
    // Maxwell's term restores the law through the same bag
    await fig.getByRole('button', { name: 'חוק אמפר-מקסוול' }).click();
    await expect(readout).not.toContainText('סתירה');
    await expect(readout).toContainText('μ₀(Ic + Id) = 9.15·10⁻¹⁰ T·m');
    expect((await progress(page)).tasks['fig-6-12a:fix']).toBeTruthy();
    await noSidewaysScroll(page);
  });

  test('between the plates a small loop takes in r²/a² of the displacement current, and B grows with r', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'מסלול בין הלוחות' }).click();
    await fig.getByRole('button', { name: 'חוק אמפר-מקסוול' }).click();
    // r = 6 cm inside plates of 10 cm: 36% of 0.728 mA, B = μ₀Ir/(2πa²)
    await expect(readout).toContainText('Id = 0.262 mA');
    await expect(readout).toContainText('B = 0.873 nT');
    expect((await progress(page)).tasks['fig-6-12a:gap-inside']).toBeTruthy();
    await setSlider(fig.getByRole('slider', { name: 'רדיוס המסלול' }), 3);
    await expect(readout).toContainText('B = 0.437 nT');
    // beyond the plate edge the loop takes in all of it, and B is the wire's μ₀I/(2πr)
    await setSlider(fig.getByRole('slider', { name: 'רדיוס המסלול' }), 15);
    await expect(readout).toContainText('Id = 0.728 mA');
    await expect(readout).toContainText('B = 0.97 nT');
    await noSidewaysScroll(page);
  });

  test('late in the charging the field is strongest but the displacement current has died away', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.getByRole('slider', { name: 'הזמן מאז סגירת המתג (ביחידות של τ)' }), 5);
    // 1.2 mA·e^(−5)
    await expect(readout).toContainText('I = 8.09·10⁻³ mA');
    expect((await progress(page)).tasks['fig-6-12a:late']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-12"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'החוק מנבא אותה סירקולציה' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the charging-shape answer gets targeted feedback, then 40.6 μA passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.12-id-rc"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('259');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('קצב השינוי');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('40.6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "charge crosses the gap" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.12-no-charge"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'כן, וזה זרם ההעתקה' }).click();
    await q.locator('.reasons label', { hasText: 'אלקטרונים שקופצים' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.12-no-charge', correct: false, confident: true, misconception: 'MC-displacement-is-charge-flow' });
    await noSidewaysScroll(page);
  });
});
