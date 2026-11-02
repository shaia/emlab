import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-7/';

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

  test('F = BIL: 0.04 N up; doubling the length in the field doubles it; reversing I flips it; electrons change nothing', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-7a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('F = BIL = 0.04 N');
    await expect(readout).toContainText('למעלה');
    const length = fig.locator('input[type=range]').nth(2);
    // a real drag passes every value on the way
    for (const v of [0.12, 0.14, 0.16, 0.18, 0.2]) await setSlider(length, v);
    await expect(readout).toContainText('F = BIL = 0.08 N');
    await fig.getByRole('button', { name: /כיוון הזרם/ }).click();
    await expect(readout).toContainText('למטה');
    await fig.getByRole('button', { name: /השדה:/ }).click();
    await expect(readout).toContainText('למעלה');
    await fig.getByRole('button', { name: 'אלקטרונים' }).click();
    await expect(readout).toContainText('למעלה');
    await setSlider(fig.locator('input[type=range]').first(), 0);
    await expect(readout).toContainText('אין כוח');
    const tasks = (await progress(page)).tasks;
    for (const t of ['double-length', 'reverse-current', 'reverse-field', 'electrons']) expect(tasks[`fig-4-7a:${t}`]).toBeTruthy();
  });

  test('F = BIL·sinα: zero along B, half at 30°, out of or into the page', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-7a');
    await fig.getByRole('button', { name: 'תיל בזווית לשדה' }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('= 0.04 N');
    await expect(readout).toContainText('לתוך הדף');
    const angle = fig.locator('input[type=range]').first();
    await setSlider(angle, 30);
    await expect(readout).toContainText('= 0.02 N');
    await setSlider(angle, 0);
    await expect(readout).toContainText('אין כוח');
    const tasks = (await progress(page)).tasks;
    for (const t of ['half', 'parallel']) expect(tasks[`fig-4-7a:${t}`]).toBeTruthy();
  });

  test('the current balance levels with 1 g at 2.5 A and reads B = 0.08 T', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-7b');
    const readout = fig.locator('.sim-readout');
    await setSlider(fig.locator('input[type=range]').first(), 2.5);
    await expect(readout).toContainText('הוסיפו משקולות');
    await fig.getByRole('button', { name: 'הוסיפו 0.5 גרם' }).click();
    await expect(readout).not.toContainText('B = mg/(IL)');
    await fig.getByRole('button', { name: 'הוסיפו 0.5 גרם' }).click();
    await expect(readout).toContainText('B = mg/(IL) = 0.08 T');
    expect((await progress(page)).tasks['fig-4-7b:balance']).toBeTruthy();
    // reversing the current pushes the frame up: masses on the pan cannot balance it
    await fig.getByRole('button', { name: 'הפכו את הזרם' }).click();
    await expect(readout).toContainText('דוחף אותה למעלה');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-7"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    // a choice clicked before the island hydrates lands in the static HTML and is lost
    const choice = predict.locator('label.q-choice', { hasText: 'הכוח לא משתנה' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the whole cable length is told apart, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.7-only-inside"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1.2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('כל הכבל');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.05');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the magnet attracts the copper" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.7-carriers-sum"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'המגנט מושך את הנחושת' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.7-carriers-sum', correct: false, confident: true, misconception: 'MC-wire-force-without-current' });
  });
});
