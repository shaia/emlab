import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-4/';

const setSlider = (slider: Locator, value: number | 'max') =>
  slider.evaluate((el: HTMLInputElement, v: number | 'max') => {
    el.value = v === 'max' ? el.max : String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-5-4a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const timeSlider = (fig: Locator) => fig.locator('input[type=range]').first();
const slider = (fig: Locator, name: string) => fig.locator('label.slider', { hasText: name }).locator('input');

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
    const c = page.locator('.sim-stage canvas');
    await expect(c).toHaveCount(1);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test('pulled from rest, the rod approaches v_T = FR/(B²L²) = 5 m/s, and doubling R doubles it', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('v_T = 5 m/s');
    await expect(readout).toContainText('τ = 2.5 s');
    await setSlider(timeSlider(fig), 15);
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    // at the terminal speed the pull's power all goes to heat
    await expect(readout).toContainText('I²R = 1.99 W');
    await setSlider(slider(fig, 'ההתנגדות'), 4);
    await expect(readout).toContainText('v_T = 10 m/s');
    await setSlider(timeSlider(fig), 'max');
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    const tasks = (await progress(page)).tasks;
    for (const t of ['terminal', 'double-R']) expect(tasks[`fig-5-4a:${t}`]).toBeTruthy();
  });

  test('flipping the field reverses the current but not the braking; removing the pull lets the rod slow to rest', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await setSlider(timeSlider(fig), 3);
    await expect(readout).toContainText('במוט למעלה בדף');
    await fig.getByRole('button', { name: /השדה:/ }).click();
    await expect(readout).toContainText('במוט למטה בדף');
    await expect(readout).toContainText('נגד התנועה');
    await fig.getByRole('button', { name: 'הסירו את הכוח F' }).click();
    await expect(readout).toContainText('v_T = 0 m/s');
    await setSlider(timeSlider(fig), 'max');
    const tasks = (await progress(page)).tasks;
    for (const t of ['flip-field', 'pull-off']) expect(tasks[`fig-5-4a:${t}`]).toBeTruthy();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });

  test('on an incline the terminal speed is 2 m/s with B normal to the rails and 2.67 m/s with B vertical', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'מסילות משופעות' }).click();
    await expect(readout).toContainText('v_T = 2 m/s');
    await setSlider(timeSlider(fig), 'max');
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    await fig.getByRole('button', { name: /השדה: ניצב/ }).click();
    await expect(readout).toContainText('v_T = 2.67 m/s');
    await setSlider(timeSlider(fig), 'max');
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    const tasks = (await progress(page)).tasks;
    for (const t of ['incline', 'vertical']) expect(tasks[`fig-5-4a:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-4"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'היא גדלה כל הזמן באותו קצב' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: forgetting the squares is told apart, then the right terminal speed passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.4-vt-value"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('בלי ריבועים');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "more resistance, slower" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.4-double-R"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'קטנה פי 2' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.4-double-R', correct: false, confident: true, misconception: 'MC-rail-more-resistance-slower' });
  });
});
