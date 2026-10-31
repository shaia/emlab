import { expect, test, type Locator, type Page } from '@playwright/test';

const LESSON = '/lessons/1-2/';

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

/** Move the first slider of a figure; its value runs 0 (rod far) to 4 (rod at the knob). */
const setSlider = (page: Page, fig: string, value: number) =>
  page
    .locator(`#${fig} input[type=range]`)
    .first()
    .evaluate((el: HTMLInputElement, v: number) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

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

  test('electroscope: a rod near a neutral electroscope opens the leaves with zero total charge', async ({ page }) => {
    await page.goto(LESSON);
    const fig = await figure(page, 'fig-1-2a');
    const readout = fig.locator('.sim-readout');
    const task = fig.locator('.sim-tasks li').first();
    // grounding is not taught yet: its controls are not on this figure
    await expect(fig.getByRole('button', { name: 'הארקה', exact: true })).toHaveCount(0);
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await expect(readout).toContainText('פתיחת העלים: 0°');
    await expect(task).not.toHaveClass(/done/);
    await setSlider(page, 'fig-1-2a', 4);
    await expect(readout).toContainText('q = 0');
    await expect(readout).toContainText('על העלים: −2e');
    await expect(readout).toContainText('פתיחת העלים: 30°');
    await expect(task).toHaveClass(/done/);
    await setSlider(page, 'fig-1-2a', 0);
    await expect(readout).toContainText('פתיחת העלים: 0°');
  });

  test('contact leaves the rod sign; induction leaves the opposite sign; the wrong order leaves nothing', async ({ page }) => {
    await page.goto(LESSON);
    const fig = await figure(page, 'fig-1-2b');
    const readout = fig.locator('.sim-readout');
    const ground = fig.getByRole('button', { name: 'הארקה', exact: true });
    const tasks = fig.locator('.sim-tasks li');
    // contact with a negative rod (reset first: a text step may already have set the figure)
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await expect(tasks.nth(0)).not.toHaveClass(/done/);
    await fig.getByRole('button', { name: 'געו בכדור' }).click();
    await setSlider(page, 'fig-1-2b', 0);
    await expect(readout).toContainText('q = −4e');
    await expect(tasks.nth(0)).toHaveClass(/done/);
    // the rod is only half charged after the touch: choose it again, then induce in the right order
    await expect(fig.getByText('המוט נשאר טעון רק בחלקו')).toBeVisible();
    await fig.getByRole('button', { name: /מוט שלילי/ }).click();
    await expect(tasks.nth(1)).not.toHaveClass(/done/);
    await setSlider(page, 'fig-1-2b', 4);
    await ground.click();
    await expect(readout).toContainText('על העלים: 0');
    await expect(fig.locator('.sim-controls .hint', { hasText: 'אלקטרונים שעברו לאדמה' })).toContainText('4');
    await ground.click();
    await setSlider(page, 'fig-1-2b', 0);
    await expect(readout).toContainText('q = +4e');
    await expect(readout).toContainText('המוט: q = −8e');
    await expect(tasks.nth(1)).toHaveClass(/done/);
    // the wrong order: the rod goes away before the ground is disconnected
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await setSlider(page, 'fig-1-2b', 4);
    await ground.click();
    await setSlider(page, 'fig-1-2b', 0);
    await ground.click();
    await expect(readout).toContainText('q = 0');
  });

  test('polarise: the force is an attraction for both signs, and the task needs both', async ({ page }) => {
    await page.goto(LESSON);
    const fig = await figure(page, 'fig-1-2c');
    const readout = fig.locator('.sim-readout');
    const task = fig.locator('.sim-tasks li').first();
    await fig.getByRole('button', { name: /גוף שלילי/ }).click();
    await expect(readout).toContainText('משיכה');
    await expect(task).not.toHaveClass(/done/);
    await fig.getByRole('button', { name: /גוף חיובי/ }).click();
    await expect(readout).toContainText('חיובי');
    await expect(readout).toContainText('משיכה');
    await expect(task).toHaveClass(/done/);
    await fig.getByRole('button', { name: /בלי מטען/ }).click();
    await expect(readout).toContainText('אין כוח');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing, and stays open after navigation', async ({ page }) => {
    await page.goto(LESSON);
    await page.locator('[data-predict-id="pred-1-2"]').scrollIntoViewIfNeeded();
    const predict = page.locator('astro-island:not([ssr]) [data-predict-id="pred-1-2"]');
    await expect(predict).toBeVisible();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    // predict choices are not shuffled: the second one is the right answer
    await predict.locator('label.q-choice').nth(1).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-2'].choice).toBe('1');
    await page.goto(LESSON);
    await page.locator('[data-predict-id="pred-1-2"]').scrollIntoViewIfNeeded();
    const again = page.locator('astro-island:not([ssr]) [data-predict-id="pred-1-2"]');
    await expect(again).toBeVisible();
    await expect(again).toHaveClass(/is-open/);
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });
});

test.describe('questions', () => {
  test('a confident wrong answer records the misconception; retry then succeeds', async ({ page }) => {
    await page.goto(LESSON);
    const q = await question(page, 'Q-1.2-contact-sign');
    await choice(q, 'חיובי').click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    await expect(q.locator('.q-feedback')).toContainText('איבד אלקטרונים');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.2-contact-sign', correct: false, confident: true, misconception: 'MC-contact-opposite-sign', lesson: '1.2' });

    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await choice(q, 'שלילי').click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric: taking all of the charge gets targeted feedback, the half passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = await question(page, 'Q-1.2-share-spheres');
    const input = q.locator('input[type=text]');
    await input.fill('5.0e10');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('מחציתם');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2.5e10');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('vector rose: the neutral paper is pulled toward a negative rod', async ({ page }) => {
    await page.goto(LESSON);
    const v = await question(page, 'Q-1.2-paper-direction');
    await v.getByRole('radio', { name: 'ימינה', exact: true }).click();
    await v.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(v.locator('.q-feedback')).toContainText('דחייה');
    await v.getByRole('button', { name: 'נסו שוב' }).click();
    await v.getByRole('radio', { name: 'שמאלה', exact: true }).click();
    await v.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(v).toHaveClass(/is-right/);
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
    await expect(page.locator('[data-lesson-id="1.2"]')).toHaveClass(/completed/);
  });
});
