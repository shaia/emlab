import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-5/';

const setSlider = (slider: Locator, value: number | 'max') =>
  slider.evaluate((el: HTMLInputElement, v: number | 'max') => {
    el.value = v === 'max' ? el.max : String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-5-5a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const timeSlider = (fig: Locator) => fig.locator('input[type=range]').first();
const slider = (fig: Locator, name: string) => fig.locator('label.slider', { hasText: name }).locator('input');
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

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

  test('the figure draws in every view, in LTR physics space', async ({ page }) => {
    const fig = await openFigure(page);
    const c = fig.locator('.sim-stage canvas');
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
    for (const view of ['מסילות אנכיות', 'משקולת וגלגלת']) {
      await fig.getByRole('button', { name: view }).click();
      await setSlider(timeSlider(fig), 1);
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('on an incline the terminal speed is 2 m/s with B normal to the rails and 2.67 m/s with B vertical', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('v_T = 2 m/s');
    await expect(readout).toContainText('mg·sinα = 0.5 N');
    await setSlider(timeSlider(fig), 'max');
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    await fig.getByRole('button', { name: /השדה: ניצב/ }).click();
    await expect(readout).toContainText('v_T = 2.67 m/s');
    await setSlider(timeSlider(fig), 'max');
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    const tasks = (await progress(page)).tasks;
    for (const t of ['incline', 'vertical']) expect(tasks[`fig-5-5a:${t}`]).toBeTruthy();
  });

  test('between vertical rails v_T = mgR/(B²L²) = 4 m/s, and a rod twice as heavy falls twice as fast', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'מסילות אנכיות' }).click();
    await expect(readout).toContainText('v_T = 4 m/s');
    await expect(readout).toContainText('τ = 0.4 s');
    await setSlider(timeSlider(fig), 'max');
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    await setSlider(slider(fig, 'מסת המוט'), 0.2);
    await expect(readout).toContainText('v_T = 8 m/s');
    // a new mass is a new body: the run starts again from rest
    await expect(readout).toContainText('t = 0 s');
    await setSlider(timeSlider(fig), 'max');
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    const tasks = (await progress(page)).tasks;
    for (const t of ['fall', 'fall-mass']) expect(tasks[`fig-5-5a:${t}`]).toBeTruthy();
  });

  test('a hanging mass M = 0.05 kg drives the rod to v_T = MgR/(B²L²) = 4 m/s, with the string then holding Mg', async ({ page }) => {
    const fig = await openFigure(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'משקולת וגלגלת' }).click();
    await expect(readout).toContainText('v_T = 4 m/s');
    await expect(readout).toContainText('τ = 1.2 s');
    await expect(readout).toContainText('T = 0.333 N');
    await setSlider(timeSlider(fig), 'max');
    await expect(readout).toContainText('המוט כמעט במהירות הסופית');
    await expect(readout).toContainText('T = 0.5');
    // the rod's mass does not change v_T
    await setSlider(slider(fig, 'מסת המוט'), 0.3);
    await expect(readout).toContainText('v_T = 4 m/s');
    expect((await progress(page)).tasks['fig-5-5a:pulley']).toBeTruthy();
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-5"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'אותה מהירות סופית' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: forgetting sin α is told apart, then the right terminal speed passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.5-incline-vt"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('6.25');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('שכחתם את');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.125');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('vector rose: the current in a rod sliding down the incline is into the page', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.5-incline-current-dir"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: /החוצה מהדף/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.5-incline-current-dir', correct: false, confident: true, misconception: 'MC-rail-magnetic-force-helps' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.getByRole('radio', { name: /לתוך הדף/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "a strong field holds the rod" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.5-brake-hold"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'כן, בשדה חזק מספיק המוט נעצר' }).click();
    await q.locator('label', { hasText: 'הכוח המגנטי תמיד קטן מהמשקל' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.5-brake-hold', correct: false, confident: true, misconception: 'MC-eddy-brake-stops-completely' });
  });
});
