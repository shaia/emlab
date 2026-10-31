import { expect, test, type Page } from '@playwright/test';

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

  test('electroscope: a rod near a neutral electroscope opens the leaves with zero total charge', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-2a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('פתיחת העלים: 0°');
    await setSlider(page, 'fig-1-2a', 4);
    await expect(readout).toContainText('Q = 0');
    await expect(readout).toContainText('על העלים: −2e');
    await expect(readout).toContainText('פתיחת העלים: 30°');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    await setSlider(page, 'fig-1-2a', 0);
    await expect(readout).toContainText('פתיחת העלים: 0°');
  });

  test('contact leaves the rod sign; induction leaves the opposite sign; the wrong order leaves nothing', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-2b');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    const ground = fig.getByRole('button', { name: 'הארקה', exact: true });
    // contact with a negative rod (reset first: a text step may already have set the figure)
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await fig.getByRole('button', { name: 'גע בכדור' }).click();
    await setSlider(page, 'fig-1-2b', 0);
    await expect(readout).toContainText('Q = −4e');
    await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/);
    // induction, in the right order
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await setSlider(page, 'fig-1-2b', 4);
    await ground.click();
    await expect(readout).toContainText('על העלים: 0');
    await ground.click();
    await setSlider(page, 'fig-1-2b', 0);
    await expect(readout).toContainText('Q = +4e');
    await expect(readout).toContainText('המוט: Q = −8e');
    await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
    // the wrong order: the rod goes away before the ground is disconnected
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await setSlider(page, 'fig-1-2b', 4);
    await ground.click();
    await setSlider(page, 'fig-1-2b', 0);
    await ground.click();
    await expect(readout).toContainText('Q = 0');
  });

  test('polarise: the force is an attraction for both signs of the charged body', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-2c');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('משיכה');
    await fig.getByRole('button', { name: /גוף חיובי/ }).click();
    await expect(readout).toContainText('חיובי');
    await expect(readout).toContainText('משיכה');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    await fig.getByRole('button', { name: /בלי מטען/ }).click();
    await expect(readout).toContainText('אין כוח');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing, and stays open after navigation', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-2"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').nth(1).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-2'].choice).toBe('1');
    await page.goto(LESSON);
    await page.locator('[data-predict-id="pred-1-2"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-predict-id="pred-1-2"]')).toHaveClass(/is-open/);
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });
});

test.describe('questions', () => {
  test('a confident wrong answer records the misconception; retry then succeeds', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.2-contact-sign"]');
    await q.scrollIntoViewIfNeeded();
    await q.locator('.q-choices').first().locator('label').nth(1).click(); // positive
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    await expect(q.locator('.q-feedback')).toContainText('חיובי היה אם');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.2-contact-sign', correct: false, confident: true, misconception: 'MC-contact-opposite-sign', lesson: '1.2' });

    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.locator('.q-choices').first().locator('label').nth(0).click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric: taking all of the charge gets targeted feedback, the half passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.2-share-spheres"]');
    await q.scrollIntoViewIfNeeded();
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
    const v = page.locator('[data-qid="Q-1.2-paper-direction"]');
    await v.scrollIntoViewIfNeeded();
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
