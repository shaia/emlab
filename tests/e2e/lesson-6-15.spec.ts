import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-15/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-15a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const noSideScroll = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test.describe('live figure: two frames', () => {
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
    const c = page.locator('#fig-6-15a .sim-stage canvas');
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test('riding with the electrons at 0.6c: neutral lab wire, λ′ = 0.45 μC/m, and F′ = γF', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('F = qvB = 3.24·10⁻⁴ N');
    await expect(readout).toContainText('λ₊′ = 1.25 μC/m');
    await expect(readout).toContainText('λ₋′ = −0.8 μC/m');
    await expect(readout).toContainText('λ′ = 0.45 μC/m');
    await expect(readout).toContainText('F′ = qE′ = 4.05·10⁻⁴ N');
    await expect(readout).toContainText('F′/F = 1.25');
    await expect(readout).toContainText('דחייה מהתיל');
  });

  test('moving against the electrons: the wire turns negative and both frames attract', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').nth(1), -0.6);
    await expect(readout).toContainText('λ′ = −0.45 μC/m');
    await expect(readout).not.toContainText('דחייה');
    await expect(readout).toContainText('משיכה אל התיל');
    expect((await progress(page)).tasks['fig-6-15a:flip-v']).toBeTruthy();
    await noSideScroll(page);
  });

  test('a charge at rest feels no force in either frame', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').nth(1), 0);
    await expect(readout).toContainText('F = qvB = 0 N');
    await expect(readout).toContainText('F′ = qE′ = 0 N');
    expect((await progress(page)).tasks['fig-6-15a:stop-charge']).toBeTruthy();
  });

  test('no current: the wire is neutral in every frame', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').nth(0), 0);
    await expect(readout).toContainText('λ′ = 0 μC/m');
    await expect(readout).toContainText('F′ = qE′ = 0 N');
    expect((await progress(page)).tasks['fig-6-15a:no-current']).toBeTruthy();
  });

  test('at small speeds the two forces agree: F′/F → 1', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').nth(0), 0.1);
    await setSlider(fig.locator('input[type=range]').nth(1), 0.1);
    await expect(readout).toContainText('F′/F = 1.01');
    expect((await progress(page)).tasks['fig-6-15a:slow']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-15"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'אצלה הפרוטון במנוחה' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: λ₀(γ − 1) is caught as keeping the lab density for the electrons, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.15-net-density"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.15-net-density', correct: false, misconception: 'MC-lab-density-is-rest-density', lesson: '6.15' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSideScroll(page);
  });

  test('a confident "too small to matter" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.15-why-felt"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'חלק אחד מ' }).click();
    await q.locator('.reasons label', { hasText: 'מורגשים רק במאיצי חלקיקים' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.15-why-felt', correct: false, confident: true, misconception: 'MC-relativity-too-small', lesson: '6.15' });
  });
});
