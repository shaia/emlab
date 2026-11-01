import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-6/';

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
    const c = page.locator('.sim-stage canvas').first();
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  });

  test('the terminal voltage sags under load, equals the EMF with r = 0, and falls to zero in a short', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-6a');
    const readout = fig.locator('.sim-readout');
    // ε = 12 V, r = 1 Ω, R₁ = 5 Ω
    await expect(readout).toContainText('V₁: מראה 10 V');
    await expect(readout).toContainText('A₁: מראה 2 A');
    const [r, R] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
    for (const v of [4, 3, 2]) await setSlider(R, v);
    await expect(readout).toContainText('V₁: מראה 8 V');
    await expect(readout).toContainText('A₁: מראה 4 A');
    for (const v of [0.5, 0]) await setSlider(r, v);
    await expect(readout).toContainText('V₁: מראה 12 V');
    await setSlider(r, 1);
    await fig.getByRole('button', { name: 'סגרו את S' }).click();
    await expect(readout).toContainText('V₁: מראה 0 V');
    await expect(readout).toContainText('A₁: מראה 12 A');
    const tasks = (await progress(page)).tasks;
    for (const t of ['load-down', 'r-zero', 'short-emf']) expect(tasks[`fig-3-6a:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-3-6"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'פחות משנים-עשר וולט' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: "the terminal voltage is the EMF" is caught as that misconception, then 11 V passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.6-terminal"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('12');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.6-terminal', correct: false, misconception: 'MC-terminal-equals-emf', lesson: '3.6' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('11');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "EMF is a force" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-3.6-emf-meaning"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'בכוח של' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-3.6-emf-meaning', correct: false, confident: true, misconception: 'MC-emf-is-force' });
  });
});
