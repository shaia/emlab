import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps } from './helpers';

const LESSON = '/lessons/1-11/';

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

// islands hydrate when visible: wait for the question's island before typing into it
const hydrated = (page: Page, qid: string) =>
  expect(page.locator(`astro-island:not([ssr]) [data-qid="${qid}"]`)).toHaveCount(1);

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

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(2);
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect
        .poll(() =>
          c.evaluate((el: HTMLCanvasElement) => {
            const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
            let inked = 0;
            for (let k = 3; k < d.length; k += 4 * 7) if (d[k] > 0) inked++;
            return inked;
          }),
        )
        .toBeGreaterThan(100);
    }
  });

  test('only F against 1/r² is a straight line, and the tasks tick', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-11a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('הנקודות אינן על קו ישר');
    await fig.locator('[aria-label="הציר האופקי"] button').nth(1).click(); // r²
    await fig.locator('[aria-label="הציר האופקי"] button').nth(2).click(); // 1/r
    await expect(readout).toContainText('הנקודות אינן על קו ישר');
    await fig.locator('[aria-label="הציר האופקי"] button').nth(3).click(); // 1/r²
    await expect(readout).toContainText('הנקודות על קו ישר');
    await expect(readout).toContainText('N·m²');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-1-11a:try-all']).toBeTruthy();
    expect(tasks['fig-1-11a:straight']).toBeTruthy();
  });

  test('the unit that fits with no empty marks is e; half of it fits but leaves marks empty', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-11b');
    await fig.scrollIntoViewIfNeeded();
    // a slider set before hydration, or a text step reaching mid-screen, resets the figure mid-test
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    // a step that reached mid-screen before the freeze may already have set the unit: start from the figure's own
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    const slider = fig.locator('input[type=range]').first();
    await expect(readout).toContainText('חלק מהנקודות נופלות בין הסימונים');
    await setSlider(slider, 1.6);
    await expect(readout).toContainText('ואין סימונים ריקים');
    await setSlider(slider, 0.8);
    await expect(readout).toContainText('נשארו ריקים');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-1-11b:find-unit']).toBeTruthy();
    expect(tasks['fig-1-11b:smaller-unit']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-11"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice').filter({ has: page.locator('annotation', { hasText: /1\/r\^2/ }) }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: forgetting k gives targeted feedback, the right charge passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.11-slope-charge"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(page, 'Q-1.11-slope-charge');
    const input = q.locator('input[type=text]');
    await input.fill('1800');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('שכחתם לחלק ב-');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.11-slope-charge', correct: false, misconception: 'MC-slope-is-k', lesson: '1.11' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2e-7');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident wrong answer about the electroscope is recorded', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.11-electroscope-sign"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(page, 'Q-1.11-electroscope-sign');
    await q.locator('.q-choices').first().locator('label', { hasText: 'המוט טעון חיובית' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.11-electroscope-sign', correct: false, confident: true, misconception: 'MC-leaves-show-sign', lesson: '1.11' });
  });
});

test('every remedy anchor in the lesson exists', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['exp-electroscope', 'exp-cage', 'exp-coulomb', 'exp-millikan']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
});
