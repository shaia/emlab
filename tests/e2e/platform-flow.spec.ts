import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

test.describe('chapter test', () => {
  test('is the same for a seed, records test attempts, and ends in a report', async ({ page }) => {
    const ids = async () => {
      await page.goto('/test/ch1/?seed=7');
      await page.getByRole('button', { name: 'התחלת המבחן' }).click();
      return page.locator('.test-q').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.qid));
    };
    const first = await ids();
    expect(first.length).toBeGreaterThanOrEqual(4);
    expect(await ids()).toEqual(first);

    // no feedback while answering
    await expect(page.locator('.q-feedback')).toHaveCount(0);
    await page.getByRole('button', { name: 'הגשה וקבלת דוח' }).first().click();
    await expect(page.locator('[data-phase="report"]')).toBeVisible();
    await expect(page.getByTestId('score')).toContainText(`/${first.length}`);
    await expect(page.getByRole('heading', { name: 'שליטה לפי מטרה' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'טעויות מושגיות שזוהו' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'מה כדאי לחזור עליו' })).toBeVisible();
    const attempts = (await progress(page)).attempts;
    expect(attempts).toHaveLength(first.length);
    expect(attempts.every((a: { kind: string }) => a.kind === 'test')).toBe(true);
  });

  test('wrong answers show the misconception they reveal, with a remedy link', async ({ page }) => {
    await page.goto('/test/ch1/?seed=7');
    await page.getByRole('button', { name: 'התחלת המבחן' }).click();
    // the last option of every choice question is a distractor in most of them
    const cards = page.locator('.test-q[data-type="twotier"], .test-q[data-type="mc"]');
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      for (const group of await card.locator('fieldset.q-choices').all()) {
        const labels = group.locator('label.q-choice');
        await labels.nth((await labels.count()) - 1).click();
      }
      await card.locator('.test-sure input').check();
    }
    await page.getByRole('button', { name: 'הגשה וקבלת דוח' }).first().click();
    await expect(page.locator('[data-phase="report"]')).toBeVisible();
    await expect(page.locator('.test-report .report-list a[href*="lessons/"]').first()).toBeVisible();
  });
});

test.describe('my path', () => {
  test('reflects attempts and lesson stamps, and suggests a next step', async ({ page }) => {
    await page.goto('/lessons/1-5/');
    const q = page.locator('[data-qid="Q-1.5-negative-test-field"]');
    await q.scrollIntoViewIfNeeded();
    await q.getByRole('radio', { name: 'ימינה', exact: true }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    const end = page.getByRole('button', { name: /סיימתי את השיעור/ });
    await end.scrollIntoViewIfNeeded();
    await end.click();
    await expect(page.locator('.stamp')).toBeVisible();

    await page.goto('/me/');
    await expect(page.locator('.me-grid')).toHaveAttribute('data-ready', '1');
    await expect(page.locator('[data-objective="OBJ-1.5-2"]')).toHaveAttribute('data-level', 'learning');
    await expect(page.locator('[data-objective="OBJ-1.5-4"]')).toHaveAttribute('data-level', 'none');
    await expect(page.locator('.passport-slot[data-lesson="1.5"]')).toHaveAttribute('data-done', '1');
    await expect(page.locator('.next-step')).toBeVisible();
    await expect(page.getByText('רק בדפדפן הזה').first()).toBeVisible();
  });

  test('export, clear storage, import: state is restored', async ({ page }, info) => {
    await page.goto('/lessons/1-5/');
    const q = page.locator('[data-qid="Q-1.5-negative-test-field"]');
    await q.scrollIntoViewIfNeeded();
    await q.getByRole('radio', { name: 'ימינה', exact: true }).click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
    expect((await progress(page)).attempts).toHaveLength(1);

    await page.goto('/me/');
    await expect(page.locator('.me-grid')).toHaveAttribute('data-ready', '1');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ייצוא ההתקדמות לקובץ' }).click()]);
    const file = info.outputPath('progress.json');
    await download.saveAs(file);
    expect(JSON.parse(readFileSync(file, 'utf8')).attempts).toHaveLength(1);

    await page.evaluate(() => localStorage.clear());
    await page.goto('/me/');
    await expect(page.locator('[data-objective="OBJ-1.5-2"]')).toHaveAttribute('data-level', 'none');

    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.locator('.io-msg')).toContainText('מוזגה');
    await expect(page.locator('[data-objective="OBJ-1.5-2"]')).toHaveAttribute('data-level', 'learning');
    expect((await progress(page)).attempts).toHaveLength(1);

    // importing the same file again adds nothing
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.locator('.io-msg')).toContainText('נוספו 0');
    expect((await progress(page)).attempts).toHaveLength(1);

    // a file that is not progress is refused
    await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
    await expect(page.locator('.io-msg.bad')).toBeVisible();
  });
});

test.describe('reference pages', () => {
  test('formula sheet lists the lesson cards, glossary is alphabetical with lesson links', async ({ page }) => {
    await page.goto('/formulas/');
    await expect(page.locator('.formula-card')).not.toHaveCount(0);
    await expect(page.locator('[data-lesson="1.5"] .formula-card').first()).toContainText('הגדרת השדה החשמלי');
    await page.goto('/glossary/');
    const terms = await page.locator('.gloss-entry dt > span:first-child').allInnerTexts();
    expect(terms.length).toBeGreaterThan(3);
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, 'he')));
    await expect(page.locator('[data-term="electric-field"] a[href*="lessons/1-5/"]')).toBeVisible();
  });

  test('the header and the contents page link to the new pages', async ({ page }) => {
    await page.goto('/');
    for (const name of ['המסלול שלי', 'דף נוסחאות', 'מילון']) {
      await expect(page.locator('header nav').getByRole('link', { name })).toBeVisible();
    }
    // one practice page and one chapter test per chapter with a question bank (chapters 0 and 1 so far)
    await expect(page.getByRole('link', { name: 'דף תרגול' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'מבחן פרק' }).first()).toBeVisible();
  });
});
