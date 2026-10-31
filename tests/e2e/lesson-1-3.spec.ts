import { expect, test, type Page } from '@playwright/test';

const LESSON = '/lessons/1-3/';

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

const setRange = (loc: ReturnType<Page['locator']>, value: number) =>
  loc.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Islands hydrate when visible: input sent before that is lost. The canvas is drawn only after hydration. */
const hydrated = (fig: ReturnType<Page['locator']>) =>
  expect
    .poll(() =>
      fig.locator('canvas').evaluate((el: HTMLCanvasElement) => {
        const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
        for (let k = 3; k < d.length; k += 4 * 5) if (d[k] > 0) return true;
        return false;
      }),
    )
    .toBe(true);

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

  test('doubling the distance cuts the force to a quarter, and ticks the task', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-3a');
    await fig.scrollIntoViewIfNeeded();
    await hydrated(fig);
    const readout = fig.locator('.sim-readout');
    const read = async () => {
      const t = (await readout.innerText()).replace(/\s+/g, ' ');
      return { F1: Number(t.match(/F₁ = (\S+) N/)?.[1]), F2: Number(t.match(/F₂ = (\S+) N/)?.[1]) };
    };
    const before = await read();
    expect(before.F1).toBeCloseTo(0.9, 6);
    // sliders: q1, q2, r. r runs 10..50 cm
    await setRange(fig.locator('input[type=range]').nth(2), 40);
    await expect.poll(async () => (await read()).F1).toBeCloseTo(0.225, 6);
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-3a:double-r']).toBeTruthy();
  });

  test('unequal charges give equal forces on both, and opposite signs attract', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-3a');
    await fig.scrollIntoViewIfNeeded();
    await hydrated(fig);
    const readout = fig.locator('.sim-readout');
    const sliders = fig.locator('input[type=range]');
    // charge steps are [-4..-1, 1..4] μC: index 7 is +4, index 4 is +1, index 2 is -2
    await setRange(sliders.nth(0), 7);
    await setRange(sliders.nth(1), 4);
    const t = (await readout.innerText()).replace(/\s+/g, ' ');
    expect(t.match(/F₁ = (\S+) N/)?.[1]).toBe(t.match(/F₂ = (\S+) N/)?.[1]);
    await expect(fig.locator('.sim-tasks li').nth(2)).toHaveClass(/done/);
    await setRange(sliders.nth(1), 2);
    await expect(readout).toContainText('מושכים');
    await expect(fig.locator('.sim-tasks li').nth(3)).toHaveClass(/done/);
  });

  test('a charge can be dragged to change the distance', async ({ page, isMobile }) => {
    test.skip(isMobile, 'touch drag is covered by pointer events; mouse drag checked on desktop');
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-3a');
    await fig.scrollIntoViewIfNeeded();
    await hydrated(fig);
    const readout = fig.locator('.sim-readout');
    const before = await readout.innerText();
    const box = (await fig.locator('canvas').boundingBox())!;
    // r = 20 cm is 0.84 · 20/60 of the stage width, centred; the scene row is at half the scene height
    const rpx = (20 / 60) * 0.84 * box.width;
    const x = box.x + box.width / 2 + rpx / 2;
    const y = box.y + box.height * 0.4 * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 6 });
    await page.mouse.up();
    await expect(readout).not.toHaveText(before);
  });

  test('gravity figure: the ratio does not depend on distance, and the pairs differ', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-3c');
    await fig.scrollIntoViewIfNeeded();
    await hydrated(fig);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('2.3·10³⁹');
    await setRange(fig.locator('input[type=range]'), 5);
    await expect(readout).toContainText('2.3·10³⁹');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    await fig.getByRole('button', { name: 'שני פרוטונים' }).click();
    await expect(readout).toContainText('1.2·10³⁶');
    await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing, and the summary closes the loop', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-3"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').nth(1).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-3'].choice).toBe('1');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });
});

test.describe('questions', () => {
  test('a confident wrong answer about the third law is recorded as a misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.3-third-law"]');
    await q.scrollIntoViewIfNeeded();
    // the card hydrates when visible: retry the selection until the check button is live
    await expect(async () => {
      await q.locator('.q-choices').first().locator('label', { hasText: 'כי המטען שלו גדול יותר' }).click();
      await q.locator('.reasons label', { hasText: 'המטען הגדול מקבל כוח גדול' }).click();
      await expect(q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true })).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.3-third-law', correct: false, confident: true, misconception: 'MC-coulomb-bigger-charge-bigger-force', lesson: '1.3' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.locator('.q-choices').first().locator('label', { hasText: 'שניהם מקבלים כוח שווה' }).click();
    await q.locator('.reasons label', { hasText: 'חוק שלישי של ניוטון' }).click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric: forgetting the square is caught, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.3-force-value"]');
    await q.scrollIntoViewIfNeeded();
    const input = q.locator('input[type=text]');
    await expect(async () => {
      await input.fill('0.3');
      await expect(q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true })).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('חילקתם');
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ misconception: 'MC-coulomb-linear-in-r' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1.0');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });
});

test.describe('lesson completion', () => {
  test('finishing stamps the lesson and marks it in the contents', async ({ page }) => {
    await page.goto(LESSON);
    const end = page.getByRole('button', { name: /סיימתי את השיעור/ });
    await end.scrollIntoViewIfNeeded();
    await end.click();
    await expect(page.locator('.stamp')).toBeVisible();
    await page.goto('/');
    await expect(page.locator('[data-lesson-id="1.3"]')).toHaveClass(/completed/);
  });
});
