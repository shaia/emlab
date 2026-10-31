import { expect, test, type Page } from '@playwright/test';

const LESSON = '/lessons/1-5/';

/** Fail the test on any console error or uncaught exception. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

test.describe('every page', () => {
  for (const path of ['/', LESSON]) {
    test(`${path} renders in Hebrew RTL with no errors`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'he');
      await expect(page.locator('.katex-error')).toHaveCount(0);
      // scroll through so every lazily hydrated island mounts
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
      });
      await page.waitForTimeout(300);
      expect(errors).toEqual([]);
      // nothing may widen the page: sideways scrolling on a phone misplaces every tap
      const { sw, cw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(sw).toBeLessThanOrEqual(cw);
    });

    test(`${path} has no dead internal links`, async ({ page, request }) => {
      await page.goto(path);
      const hrefs = await page.$$eval('a[href]', (as) =>
        [...new Set(as.map((a) => (a as HTMLAnchorElement).href))].filter((h) => h.startsWith(location.origin)),
      );
      expect(hrefs.length).toBeGreaterThan(0);
      for (const h of hrefs) {
        const url = h.split('#')[0];
        const res = await request.get(url);
        expect(res.status(), url).toBe(200);
      }
    });
  }
});

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

  test('doubling q₀ doubles F but leaves E unchanged, and ticks the task', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-5a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('E = F/q₀');
    const read = async () => {
      const t = (await readout.innerText()).replace(/\s+/g, ' ');
      return { F: t.match(/F = (\S+) N/)?.[1], E: t.match(/= (\S+) N\/C/)?.[1] };
    };
    const before = await read();
    const slider = fig.locator('input[type=range]').first();
    // q₀ steps are [-4..-1, 1..4] nC; index 5 is +2 nC
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const after = await read();
    expect(after.E).toBe(before.E);
    expect(after.F).not.toBe(before.F);
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-5a:change-q0']).toBeTruthy();
  });

  test('the test charge can be dragged', async ({ page, isMobile }) => {
    test.skip(isMobile, 'touch drag is covered by pointer events; mouse drag checked on desktop');
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-5a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    const before = await readout.innerText();
    const canvas = fig.locator('canvas');
    const box = (await canvas.boundingBox())!;
    // probe starts at world (0.35, 0.3) on a 2 m × 1.5 m stage centred on the canvas
    const ppm = box.width / 2;
    const px = box.x + box.width / 2 + 0.35 * ppm;
    const py = box.y + box.height / 2 - 0.3 * ppm;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + 120, py + 60, { steps: 6 });
    await page.mouse.up();
    await expect(readout).not.toHaveText(before);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing, and stays open after reload', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-5"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').nth(1).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-5'].choice).toBe('1');
    // a fresh navigation, not page.reload(): reload never settles under Edge headless here
    await page.goto(LESSON);
    // islands hydrate when visible: the restored state appears once the block is on screen
    await page.locator('[data-predict-id="pred-1-5"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-predict-id="pred-1-5"]')).toHaveClass(/is-open/);
    // the summary closes the loop
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });
});

test.describe('questions', () => {
  test('a confident wrong answer is recorded as a misconception; retry then succeeds', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.5-test-charge-double"]');
    await q.scrollIntoViewIfNeeded();
    await q.locator('.q-choices').first().locator('label').nth(0).click(); // "it doubles"
    await q.locator('.reasons label').nth(1).click(); // "the field is the force"
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    await expect(q.locator('.q-feedback')).toContainText('השדה איננו הכוח');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.5-test-charge-double', correct: false, confident: true, misconception: 'MC-field-depends-on-test-charge', lesson: '1.5' });

    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.locator('.q-choices').first().locator('label').nth(1).click();
    await q.locator('.reasons label').nth(0).click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
    await expect(q.locator('.q-explanation')).toBeVisible();
  });

  test('numeric: right value, and a known wrong value with targeted feedback', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.5-point-field"]');
    await q.scrollIntoViewIfNeeded();
    const input = q.locator('input[type=text]');
    await input.fill('3.6*10^4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('במקום ב-');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('7.2e4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('vector rose and ranking with a tie', async ({ page }) => {
    await page.goto(LESSON);
    const v = page.locator('[data-qid="Q-1.5-negative-test-field"]');
    await v.scrollIntoViewIfNeeded();
    await v.getByRole('radio', { name: 'שמאלה', exact: true }).click();
    await v.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(v.locator('.q-feedback')).toContainText('זה כיוון');

    const r = page.locator('[data-qid="Q-1.5-rank-points"]');
    await r.scrollIntoViewIfNeeded();
    // items start as C, A, B (not the answer); move A up to get A, C, B, then tie C = B
    await r.getByRole('button', { name: 'למעלה' }).nth(1).click();
    await r.locator('.q-rank-rel').nth(1).click();
    await r.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(r).toHaveClass(/is-right/);
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
    await expect(page.locator('[data-lesson-id="1.5"]')).toHaveClass(/completed/);
  });
});
