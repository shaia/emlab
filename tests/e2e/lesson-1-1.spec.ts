import { expect, test, type Page } from '@playwright/test';

const LESSON = '/lessons/1-1/';

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

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

  test('pair: like charges repel, unlike attract, and all four combinations tick the task', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-1a');
    await fig.scrollIntoViewIfNeeded();
    const left = fig.getByRole('group', { name: 'הכדור השמאלי' });
    const right = fig.getByRole('group', { name: 'הכדור הימני' });
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('דוחים');
    await right.getByRole('button', { name: /שלילי/ }).click();
    await expect(readout).toContainText('מושכים');
    await left.getByRole('button', { name: /שלילי/ }).click();
    await expect(readout).toContainText('דוחים');
    await right.getByRole('button', { name: /חיובי/ }).click();
    await expect(readout).toContainText('מושכים');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-1a:all-four']).toBeTruthy();
  });

  test('rub: electrons move one by one, the total stays zero, the charge is a multiple of e', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-1b');
    await fig.scrollIntoViewIfNeeded();
    // a text step may already have set the figure: start from the neutral state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('Q₁ + Q₂ = 0 C');
    const rub = fig.getByRole('button', { name: /שפשפו: עוד אלקטרון/ });
    for (let i = 0; i < 3; i++) await rub.click();
    await expect(readout).toContainText('Q = +3e = 4.8·10⁻¹⁹ C');
    await expect(readout).toContainText('Q = −3e = −4.8·10⁻¹⁹ C');
    await expect(readout).toContainText('Q₁ + Q₂ = 0 C');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    await fig.getByRole('button', { name: 'PVC וצמר' }).click();
    await rub.click();
    await expect(readout).toContainText('Q = −1e');
  });

  test('materials: the same electrons spread on the metal bar and stay on the plastic bar', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-1c');
    await fig.scrollIntoViewIfNeeded();
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await fig.getByRole('button', { name: /הניחו 6 אלקטרונים/ }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('1 · 1 · 1 · 1 · 1 · 1');
    await expect(readout).toContainText('6 · 0 · 0 · 0 · 0 · 0');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing, and stays open after navigation', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-1"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').nth(1).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-1'].choice).toBe('1');
    await page.goto(LESSON);
    await page.locator('[data-predict-id="pred-1-1"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-predict-id="pred-1-1"]')).toHaveClass(/is-open/);
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });
});

test.describe('questions', () => {
  test('a confident wrong answer records the misconception; retry then succeeds', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.1-rub-cloth"]');
    await q.scrollIntoViewIfNeeded();
    await q.locator('.q-choices').first().locator('label').nth(1).click(); // the cloth stays neutral
    await q.locator('.reasons label').nth(1).click(); // friction creates charge
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    await expect(q.locator('.q-feedback')).toContainText('חיכוך לא יוצר מטען');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.1-rub-cloth', correct: false, confident: true, lesson: '1.1' });
    expect(a.misconception).toBe('MC-charge-created');

    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.locator('.q-choices').first().locator('label').nth(0).click();
    await q.locator('.reasons label').nth(0).click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric: the multiplied value gets targeted feedback, the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.1-count-electrons"]');
    await q.scrollIntoViewIfNeeded();
    const input = q.locator('input[type=text]');
    await input.fill('7.68e-25');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('כפלתם');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.0e13');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('vector rose: the wrong direction explains the attraction', async ({ page }) => {
    await page.goto(LESSON);
    const v = page.locator('[data-qid="Q-1.1-force-direction"]');
    await v.scrollIntoViewIfNeeded();
    await v.getByRole('radio', { name: 'ימינה', exact: true }).click();
    await v.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(v.locator('.q-feedback')).toContainText('דוחים');
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
