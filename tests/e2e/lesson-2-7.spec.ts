import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-7/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

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
    expect(await c.count()).toBe(1);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test('double V gives 4U; pulling the plates apart doubles U when isolated and halves it when connected', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-7a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const readout = fig.locator('.sim-readout');
    const [, gap, volts] = [0, 1, 2].map((i) => fig.locator('input[type=range]').nth(i));
    const battery = fig.getByRole('button', { name: 'מחובר לסוללה' });
    // 88.5 pF at 200 V: U = ½CV² = 1.77 μJ
    await expect(readout).toContainText('U = 1.77 μJ');
    await setSlider(volts, 400);
    await expect(readout).toContainText('U = 7.08 μJ');
    await setSlider(volts, 200);
    await battery.click();
    await setSlider(gap, 4);
    await expect(readout).toContainText('Q = 17.7 nC');
    await expect(readout).toContainText('V = 400 V');
    await expect(readout).toContainText('E = 1·10⁵ V/m');
    await expect(readout).toContainText('U = 3.54 μJ');
    await setSlider(gap, 2);
    await battery.click();
    await setSlider(gap, 4);
    await expect(readout).toContainText('Q = 8.85 nC');
    await expect(readout).toContainText('U = 0.885 μJ');
    const tasks = (await progress(page)).tasks;
    for (const t of ['double-v-energy', 'pull-disconnected', 'pull-connected']) expect(tasks[`fig-2-7a:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-7"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'היא גדלה פי 2.' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: a missing ½ gets targeted feedback, then the right energy passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.7-energy-cv"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.01');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('משולש');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('5e-3');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the voltage stays put in an isolated capacitor" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.7-isolated-half-gap"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'כי הקיבול גדל פי 2' }).click();
    await q.locator('.reasons label', { hasText: 'המתח קבוע' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.7-isolated-half-gap', correct: false, confident: true, misconception: 'MC-isolated-v-constant', lesson: '2.7' });
  });
});
