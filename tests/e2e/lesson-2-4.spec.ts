import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-4/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

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

  test('every figure draws, in LTR physics space', async ({ page }) => {
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

  test('the arrival speed depends on the voltage only: a wider gap changes nothing, four times the voltage doubles it', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-4a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const readout = fig.locator('.sim-readout');
    const launch = fig.getByRole('button', { name: 'שגרו' });
    const [volts, , gap] = [0, 1, 2].map((i) => fig.locator('input[type=range]').nth(i));
    // an electron from rest through 1000 V: v = √(2eV/m) = 1.88·10⁷ m/s, K = 1000 eV
    // the outcome is held back until the learner launches
    await expect(readout).toContainText('לחצו "שגרו"');
    await launch.click();
    await expect(readout).toContainText('v = 1.88·10⁷ m/s');
    await setSlider(gap, 0.3);
    await launch.click();
    await expect(readout).toContainText('v = 1.88·10⁷ m/s');
    await setSlider(volts, -500);
    await launch.click();
    await expect(readout).toContainText('v = 1.33·10⁷ m/s');
    await setSlider(volts, -2000);
    await launch.click();
    await expect(readout).toContainText('v = 2.65·10⁷ m/s');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-2-4a:launch']).toBeTruthy();
    expect(tasks['fig-2-4a:gap-same']).toBeTruthy();
    expect(tasks['fig-2-4a:four-v']).toBeTruthy();
  });

  test('a proton with 500 eV cannot climb 1000 V: it turns half way', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-4a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'פרוטון', exact: true }).click();
    await setSlider(fig.locator('input[type=range]').nth(1), 500);
    await fig.getByRole('button', { name: 'שגרו' }).click();
    await expect(readout).toContainText('נעצר אחרי 30 cm');
    expect((await progress(page)).tasks['fig-2-4a:stop']).toBeTruthy();
  });

  test('doubling the alpha energy halves the distance of closest approach', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-4b');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const readout = fig.locator('.sim-readout');
    // 5 MeV alpha on gold: r = kqQ/K = 4.55·10⁻¹⁴ m
    await fig.getByRole('button', { name: 'שגרו' }).click();
    await expect(readout).toContainText('r_min = 4.55·10⁻¹⁴ m');
    await setSlider(fig.locator('input[type=range]').first(), 10);
    await fig.getByRole('button', { name: 'שגרו' }).click();
    await expect(readout).toContainText('r_min = 2.28·10⁻¹⁴ m');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-2-4b:closest']).toBeTruthy();
    expect(tasks['fig-2-4b:double-k']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-4"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'באותה מהירות' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the electron mass in a proton question gets targeted feedback, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.4-proton-speed"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1.33e7');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('מסת האלקטרון');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.1e5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "a wider gap makes it faster" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.4-wider-gap"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: /^3v/ }).click();
    await q.locator('.reasons label', { hasText: 'זמן רב יותר' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.4-wider-gap', correct: false, confident: true, misconception: 'MC-wider-gap-faster', lesson: '2.4' });
  });
});
