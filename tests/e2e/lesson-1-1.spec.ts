import { expect, test, type Locator, type Page } from '@playwright/test';

const LESSON = '/lessons/1-1/';

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

/** A question block, once its island has hydrated (clicks before that are lost). */
async function question(page: Page, id: string): Promise<Locator> {
  // islands hydrate when visible: scroll the server-rendered block into view, then wait for the hydrated one
  await page.locator(`[data-qid="${id}"]`).scrollIntoViewIfNeeded();
  const q = page.locator(`astro-island:not([ssr]) [data-qid="${id}"]`);
  await expect(q).toBeVisible();
  return q;
}

/** A figure, once its island has hydrated. */
async function figure(page: Page, id: string): Promise<Locator> {
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  return fig;
}

/** Choices are picked by their text: the order of mc / twotier choices is shuffled at build. */
const choice = (q: Locator, text: string) => q.locator('.q-choices').first().locator('label', { hasText: text }).first();
const reason = (q: Locator, text: string) => q.locator('.reasons label', { hasText: text }).first();

test.describe('live figures', () => {
  test('every simulation draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    const n = await canvases.count();
    expect(n).toBe(3);
    for (let i = 0; i < n; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect
        .poll(() =>
          c.evaluate((el: HTMLCanvasElement) => {
            const ctx = el.getContext('2d')!;
            const d = ctx.getImageData(0, 0, el.width, el.height).data;
            let inked = 0;
            for (let k = 3; k < d.length; k += 4 * 7) if (d[k] > 0) inked++;
            return inked;
          }),
        )
        .toBeGreaterThan(200);
    }
  });

  test('pair: like charges repel, unlike attract; the task ticks only after the student tries all four', async ({ page }) => {
    await page.goto(LESSON);
    const fig = await figure(page, 'fig-1-1a');
    const left = fig.getByRole('group', { name: 'הכדור השמאלי' });
    const right = fig.getByRole('group', { name: 'הכדור הימני' });
    const readout = fig.locator('.sim-readout');
    const task = fig.locator('.sim-tasks li').first();
    await expect(readout).toContainText('דוחים');
    await right.getByRole('button', { name: /שלילי/ }).click();
    await expect(readout).toContainText('מושכים');
    await expect(task).not.toHaveClass(/done/);
    await left.getByRole('button', { name: /שלילי/ }).click();
    await expect(readout).toContainText('דוחים');
    await expect(task).not.toHaveClass(/done/);
    await right.getByRole('button', { name: /חיובי/ }).click();
    await expect(readout).toContainText('מושכים');
    await expect(task).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-1a:all-four']).toBeTruthy();
  });

  test('scrolling past the text steps does not tick any guided task', async ({ page }) => {
    await page.goto(LESSON);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 300) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    const p = await progress(page);
    expect(Object.keys(p?.tasks ?? {})).toEqual([]);
  });

  test('rub: electrons move one by one, the total stays zero, the charge is a multiple of e', async ({ page }) => {
    await page.goto(LESSON);
    const fig = await figure(page, 'fig-1-1b');
    // a text step may already have set the figure: start from the neutral state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('q₁ + q₂ = 0 C');
    const rub = fig.getByRole('button', { name: /שפשפו: עוד אלקטרון/ });
    const task = fig.locator('.sim-tasks li').first();
    for (let i = 0; i < 2; i++) await rub.click();
    await expect(task).not.toHaveClass(/done/);
    await rub.click();
    await expect(readout).toContainText('q = +3e = 4.8·10⁻¹⁹ C');
    await expect(readout).toContainText('q = −3e = −4.8·10⁻¹⁹ C');
    await expect(readout).toContainText('q₁ + q₂ = 0 C');
    await expect(task).toHaveClass(/done/);
    await fig.getByRole('button', { name: 'PVC וצמר' }).click();
    await rub.click();
    await expect(readout).toContainText('q = −1e');
  });

  test('materials: the same electrons spread on the metal bar and stay on the plastic bar', async ({ page }) => {
    await page.goto(LESSON);
    const fig = await figure(page, 'fig-1-1c');
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const task = fig.locator('.sim-tasks li').first();
    await expect(task).not.toHaveClass(/done/);
    await fig.getByRole('button', { name: /הניחו 6 אלקטרונים/ }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('1 · 1 · 1 · 1 · 1 · 1');
    await expect(readout).toContainText('6 · 0 · 0 · 0 · 0 · 0');
    await expect(task).toHaveClass(/done/);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing, and stays open after navigation', async ({ page }) => {
    await page.goto(LESSON);
    await page.locator('[data-predict-id="pred-1-1"]').scrollIntoViewIfNeeded();
    const predict = page.locator('astro-island:not([ssr]) [data-predict-id="pred-1-1"]');
    await expect(predict).toBeVisible();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    // predict choices are not shuffled: the second one is the right answer
    await predict.locator('label.q-choice').nth(1).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-1'].choice).toBe('1');
    await page.goto(LESSON);
    await page.locator('[data-predict-id="pred-1-1"]').scrollIntoViewIfNeeded();
    const again = page.locator('astro-island:not([ssr]) [data-predict-id="pred-1-1"]');
    await expect(again).toBeVisible();
    await expect(again).toHaveClass(/is-open/);
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });
});

test.describe('questions', () => {
  test('a confident wrong answer records the misconception; retry then succeeds', async ({ page }) => {
    await page.goto(LESSON);
    const q = await question(page, 'Q-1.1-rub-cloth');
    await choice(q, 'הצמר נשאר ניטרלי').click();
    await reason(q, 'החיכוך יוצר מטען חדש').click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    await expect(q.locator('.q-feedback')).toContainText('חיכוך לא יוצר מטען');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.1-rub-cloth', correct: false, confident: true, lesson: '1.1' });
    expect(a.misconception).toBe('MC-charge-created');

    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await choice(q, 'הצמר טעון חיובית').click();
    await reason(q, 'אלקטרונים עברו מהצמר').click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric: the multiplied value and an exponent slip get targeted feedback, the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = await question(page, 'Q-1.1-count-electrons');
    const input = q.locator('input[type=text]');
    await input.fill('7.68e-25');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('כפלתם');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.0e12');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('באחד');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.0e13');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });
});

test.describe('lesson completion', () => {
  test('finishing stamps the lesson and marks it in the contents', async ({ page }) => {
    await page.goto(LESSON);
    const end = page.getByRole('button', { name: /סיימתי את השיעור/ });
    await end.scrollIntoViewIfNeeded();
    // the button may be clicked before its island hydrates: retry until the stamp shows
    await expect(async () => {
      await end.click();
      await expect(page.locator('.stamp')).toBeVisible({ timeout: 1500 });
    }).toPass();
    await page.goto('/');
    await expect(page.locator('[data-lesson-id="1.1"]')).toHaveClass(/completed/);
  });
});
