import { expect, test, type Page } from '@playwright/test';

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

test.describe('Bagrut question', () => {
  test('an auto-graded part, a hint that costs points, and an open part with its rubric', async ({ page }) => {
    await page.goto('/practice/ch1/');
    const b = page.locator('[data-qid="Q-1-bagrut-1"]');
    await b.scrollIntoViewIfNeeded();

    // part ב: vector, tagged with OBJ-1.5-2
    const vb = b.locator('[data-part="ב"]');
    await vb.scrollIntoViewIfNeeded();
    await vb.getByRole('radio', { name: 'שמאלה', exact: true }).click();
    await vb.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(vb.locator('.qcard')).toHaveClass(/is-right/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({
      qid: 'Q-1-bagrut-1/ב',
      objectives: ['OBJ-1.5-2'],
      correct: true,
      kind: 'practice',
    });
    await expect(b.locator('.bagrut-score')).toContainText('4');

    // part ג: one hint, then the right value: 8 points less a quarter
    const vg = b.locator('[data-part="ג"]');
    await vg.scrollIntoViewIfNeeded();
    await vg.getByRole('button', { name: /רמז/ }).click();
    await vg.locator('input[type=text]').fill('3.8e6');
    await vg.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(vg.locator('.qcard')).toHaveClass(/is-right/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1-bagrut-1/ג', hints: 1, correct: true });
    await expect(b.locator('.bagrut-score')).toContainText('10');
    // feedback and explanations appear only now: they must not widen the page on a phone
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    // part ה: open, graded by the rubric the student ticks
    const ve = b.locator('[data-part="ה"]');
    await ve.scrollIntoViewIfNeeded();
    const reveal = ve.getByRole('button', { name: 'הראו פתרון לדוגמה' });
    await expect(reveal).toBeDisabled();
    await ve.locator('textarea').fill('F = qE');
    await reveal.click();
    await expect(ve.locator('.open-steps li')).toHaveCount(4);
    const rubric = ve.locator('.open-rubric label');
    const n = await rubric.count();
    for (let i = 0; i < n; i++) await rubric.nth(i).click();
    await ve.getByRole('button', { name: 'סיימתי את הבדיקה' }).click();
    await expect(ve.locator('.q-feedback')).toContainText('ציון עצמי');
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1-bagrut-1/ה', objectives: ['OBJ-1.5-1'], correct: true });
    await expect(b.locator('.bagrut-score')).toContainText('19');
  });
});

test.describe('practice sheet', () => {
  test('lists lesson questions by level, then the Bagrut questions, and filters by level', async ({ page }) => {
    await page.goto('/practice/ch1/');
    await expect(page.locator('[data-lesson-group="1.5"]')).toBeVisible();
    await expect(page.locator('[data-level-group="basic"]').first()).toBeVisible();
    const bagrut = page.locator('[data-bagrut-group]');
    await expect(bagrut.locator('[data-type="bagrut"]')).toHaveCount(6);
    // the Bagrut questions come last
    const order = await page
      .locator('[data-lesson-group], [data-bagrut-group]')
      .evaluateAll((els) => els.map((e) => e.hasAttribute('data-bagrut-group')));
    expect(order.at(-1)).toBe(true);
    await page.getByRole('button', { name: /^בגרות \(/ }).click();
    await expect(bagrut).toBeHidden();
    await page.getByRole('button', { name: /^הכול/ }).click();
    await expect(bagrut).toBeVisible();
  });
});
