import { expect, test, type Locator, type Page } from '@playwright/test';

const LESSON = '/lessons/1-10/';

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

  test('every figure draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
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
        .toBeGreaterThan(200);
    }
  });

  test('a stronger field moves the spot further, and the task ticks', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-10a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('a = qE/m');
    const before = await readout.innerText();
    await expect(before).toContain('Y = 1.98');
    // field steps are 1..10 kN/C; index 7 is 8 kN/C, which puts the electron spot 3.16 cm up
    await setSlider(fig.locator('input[type=range]').first(), 7);
    await expect(readout).toContainText('Y = 3.16');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-10a:spot-up']).toBeTruthy();
  });

  test('a proton is deflected the other way and stopped by a plate when it is slow', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-10a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'פרוטון', exact: true }).click();
    await expect(readout).toContainText('למטה');
    await setSlider(fig.locator('input[type=range]').nth(1), 0); // 2·10⁵ m/s
    await expect(readout).toContainText('פגעה בלוח');
    expect((await progress(page)).tasks['fig-1-10a:hit-plate']).toBeTruthy();
  });

  test('the oil drop hovers at the balance field, and three drops are recorded', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-10c');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout').first();
    const record = fig.getByRole('button', { name: 'רשמו מדידה' });
    await expect(record).toBeDisabled();
    const slider = fig.locator('input[type=range]').first();
    // drop א has 3 elementary charges: 33 kN/C is within 1% of the balance field
    await setSlider(slider, 33);
    await expect(readout).toContainText('מרחפת');
    await expect(readout).toContainText('q/e ≈ 3.0');
    await record.click();
    await fig.getByRole('button', { name: 'טיפה ב', exact: true }).click();
    await setSlider(slider, 20);
    await expect(readout).toContainText('q/e ≈ 5.0');
    await record.click();
    await fig.getByRole('button', { name: 'טיפה ג', exact: true }).click();
    await setSlider(slider, 50);
    await expect(readout).toContainText('q/e ≈ 2.0');
    await record.click();
    await expect(fig.locator('ul.sim-readout li')).toHaveCount(3);
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-1-10c:balance-one']).toBeTruthy();
    expect(tasks['fig-1-10c:three-drops']).toBeTruthy();
  });

  test('a field that is too weak lets the drop fall', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-10c');
    await fig.scrollIntoViewIfNeeded();
    await setSlider(fig.locator('input[type=range]').first(), 10);
    await expect(fig.locator('.sim-readout').first()).toContainText('הטיפה יורדת');
    await setSlider(fig.locator('input[type=range]').first(), 100);
    await expect(fig.locator('.sim-readout').first()).toContainText('הטיפה עולה');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-10"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'נגד כיוון השדה' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: a known wrong value gets targeted feedback, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.10-exit-deflection"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(page, 'Q-1.10-exit-deflection');
    const input = q.locator('input[type=text]');
    await input.fill('0.422');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('שכחתם');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.21');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident wrong answer about speed is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.10-double-speed"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(page, 'Q-1.10-double-speed');
    await q.locator('.q-choices').first().locator('label', { hasText: /^4Y/ }).click();
    await q.locator('.reasons label', { hasText: 'יותר אנרגיה' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.10-double-speed', correct: false, confident: true, misconception: 'MC-faster-deflects-more', lesson: '1.10' });
  });
});
