import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-4/';

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
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(1);
    const c = canvases.first();
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test("Ampère: a circle round the wire sums to μ₀I; moved off the wire, the sum is zero", async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-4a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('6.28·10⁻⁶ T·m');
    await expect(readout).toContainText('I = 5 A');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // space selects the probe, then the whole path; shift+arrow moves it 5 cm
    await canvas.press(' ');
    await canvas.press(' ');
    for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('I = 0 A');
    await expect(readout).toContainText('B∥·Δℓ סביב המסלול: 0 T·m');
    // the probe still reads a field: zero sum is not zero field
    await expect(readout).not.toContainText('בגשש: B = 0 T');
    expect((await progress(page)).tasks['fig-4-4a:ampere-zero']).toBeTruthy();
  });

  test('Ampère in a solenoid: a rectangle across one row encloses 400 A, and the inside edge carries the sum', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-4a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'סליל', exact: true }).click();
    await expect(readout).toContainText('I = 400 A');
    await expect(readout).toContainText('μ₀I = 5.03·10⁻⁴ T·m');
    await expect(readout).toContainText('למטה 4.93·10⁻⁴');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press(' ');
    await canvas.press(' ');
    await canvas.press('ArrowUp');
    await expect(readout).toContainText('I = 400 A');
    expect((await progress(page)).tasks['fig-4-4a:ampere-solenoid']).toBeTruthy();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });

  test('a thick wire: a circle inside it encloses part of the current, and the field grows with r', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-4a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'תיל עבה', exact: true }).click();
    // 10 A through a wire of radius 12 cm; the circle of radius 6 cm encloses a quarter of it
    await expect(readout).toContainText('I = 2.5 A');
    await expect(readout).toContainText('3.14·10⁻⁶ T·m');
    await expect(readout).toContainText('בתוך התיל');
    await expect(readout).toContainText('8.33·10⁻⁶ T');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // space selects the probe, the path, then the circle's rim; an arrow shrinks it by 1 cm
    await canvas.press(' ');
    await canvas.press(' ');
    await canvas.press(' ');
    await canvas.press('ArrowLeft');
    expect((await progress(page)).tasks['fig-4-4a:thick-inside']).toBeTruthy();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-4"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    // a choice clicked before the island hydrates lands in the static HTML and is lost
    const choice = predict.locator('label.q-choice', { hasText: 'יגדל פי 2' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: dividing by the area instead of the circumference gets targeted feedback, then 50 μT passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.4-wire-B"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('2500');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('שטח העיגול');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('50');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "zero enclosed current means zero field" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.4-ampere-zero"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'השדה בכל נקודה על המסלול הוא אפס' }).click();
    await q.locator('.reasons label', { hasText: 'כשהזרם הכלוא אפס, השדה אפס' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.4-ampere-zero', correct: false, confident: true, misconception: 'MC-ampere-zero-enclosed-zero-field' });
  });
});
