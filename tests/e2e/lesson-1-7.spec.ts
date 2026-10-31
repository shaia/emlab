import { expect, test, type Locator, type Page } from '@playwright/test';

const LESSON = '/lessons/1-7/';

/** Islands hydrate when scrolled into view: an input filled earlier is lost. Retry until the check button is live. */
async function fillAndCheck(q: Locator, input: Locator, value: string) {
  const check = q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true });
  await expect(async () => {
    await input.fill(value, { timeout: 2000 });
    await expect(check).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await check.click();
}

async function pickAndCheck(q: Locator, index: number) {
  const check = q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true });
  await expect(async () => {
    await q.locator('label').nth(index).click({ timeout: 2000 });
    await expect(check).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await check.click();
}

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

const setRange = (page: Page, fig: string, index: number, value: number) =>
  page.locator(`#${fig} input[type=range]`).nth(index).evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

const inked = (c: ReturnType<Page['locator']>) =>
  c.evaluate((el: HTMLCanvasElement) => {
    const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
    let n = 0;
    for (let k = 3; k < d.length; k += 4 * 7) if (d[k] > 0) n++;
    return n;
  });

test.describe('flux window (1.7א)', () => {
  test('tilting to 90° gives zero flux and ticks the task; past 90° the flux is negative', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-7a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect.poll(() => inked(fig.locator('canvas'))).toBeGreaterThan(200);
    await setRange(page, 'fig-1-7a', 0, 0);
    await expect(readout).toContainText('Φ = E·A·cosθ = 1000');
    await setRange(page, 'fig-1-7a', 0, 90);
    await expect(readout).toContainText('= 0 N·m²/C');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    await setRange(page, 'fig-1-7a', 0, 120);
    await expect(readout).toContainText('= -500');
    expect((await progress(page)).tasks['fig-1-7a:edge-on']).toBeTruthy();
  });
});

test.describe('closed surface (1.7ב)', () => {
  test('flux follows the enclosed charge: inside, outside, and an opposite pair', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-7b');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect.poll(() => inked(fig.locator('canvas'))).toBeGreaterThan(200);
    // scrolling past the steps drives the figure: pick the state explicitly
    await fig.getByRole('button', { name: 'מטען אחד' }).click();
    await fig.getByRole('button', { name: 'עיגול' }).click();
    await expect(readout).toContainText('+2 μC');
    await expect(readout).toContainText('2.26·10⁵');
    await expect(readout).toContainText('יוצאים 8');
    await fig.getByRole('button', { name: 'מטען מחוץ' }).click();
    await expect(readout).toContainText('0 μC');
    await expect(readout).toContainText('Φ = q/ε₀ = 0 N');
    await fig.getByRole('button', { name: 'שני מטענים מנוגדים' }).click();
    await expect(readout).toContainText('Φ = q/ε₀ = 0 N');
    await fig.getByRole('button', { name: 'מטען אחד' }).click();
    await fig.getByRole('button', { name: 'ריבוע' }).click();
    await expect(readout).toContainText('2.26·10⁵');
  });

  test('dragging the charge out of the surface changes the flux', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse drag is checked on desktop');
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-7b');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'מטען אחד' }).click();
    await fig.getByRole('button', { name: 'עיגול' }).click();
    const box = (await fig.locator('canvas').boundingBox())!;
    const ppm = box.width / 2;
    // scene "single": charge at (-0.1, 0.05), circle of radius 0.42 at the origin
    const cx = box.x + box.width / 2 - 0.1 * ppm;
    const cy = box.y + box.height / 2 - 0.05 * ppm;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 0.9 * ppm, cy, { steps: 10 });
    await page.mouse.up();
    await expect(readout).toContainText('Φ = q/ε₀ = 0 N');
    await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  });
});

test.describe('Gauss in space (1.7ג)', () => {
  test('the 3D view loads lazily, and the readout follows the charge and the shape', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-7c');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    // text steps scrolled into view also drive the figure: set the position until it holds
    await expect(async () => {
      await setRange(page, 'fig-1-7c', 0, 120);
      await expect(readout).toContainText('מחוץ למשטח', { timeout: 1000 });
    }).toPass({ timeout: 10000 });
    await expect(readout).toContainText('= 0 N·m²/C');
    await setRange(page, 'fig-1-7c', 0, 0);
    await fig.getByRole('button', { name: 'כדור' }).click();
    await fig.getByRole('button', { name: /מטען \+2/ }).click();
    await expect(readout).toContainText('בתוך המשטח');
    await expect(readout).toContainText('2.26·10⁵');
    await expect(readout).toContainText('יוצאות 72');
    await fig.getByRole('button', { name: 'קובייה' }).click();
    await expect(readout).toContainText('2.26·10⁵');
    await fig.getByRole('button', { name: /מטען −2/ }).click();
    await expect(readout).toContainText('-2.26·10⁵');
    await expect(readout).toContainText('נכנסות 72');
    // WebGL is available in the test browser: the figure switches to the 3D view
    await expect(fig.locator('canvas')).toHaveAttribute('data-view', '3d');
    expect(errors).toEqual([]);
  });

  test('still mode shows the 2D cross-section', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('emlab:settings', JSON.stringify({ still: true, theme: 'auto' })));
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-7c');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('canvas')).toHaveAttribute('data-view', '2d');
    await expect.poll(() => inked(fig.locator('canvas'))).toBeGreaterThan(200);
    await setRange(page, 'fig-1-7c', 0, 0);
    await expect(fig.locator('.sim-readout')).toContainText('בתוך המשטח');
  });

  test('without WebGL the figure falls back to the 2D cross-section', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof orig;
    });
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-7c');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('canvas')).toHaveAttribute('data-view', '2d');
    await expect.poll(() => inked(fig.locator('canvas'))).toBeGreaterThan(200);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-7"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    // the island hydrates when it scrolls into view: retry until the choice registers
    await expect(async () => {
      await predict.locator('label.q-choice').nth(2).click({ timeout: 2000 });
      await expect(commit).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-7'].choice).toBe('2');
  });
});

test.describe('questions', () => {
  test('numeric: sin instead of cos gets targeted feedback, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.7-flux-calc"]');
    await q.scrollIntoViewIfNeeded();
    const input = q.locator('input[type=text]');
    await fillAndCheck(q, input, '300');
    await expect(q.locator('.q-feedback')).toContainText('הזווית היא בין');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.7-flux-calc', correct: false, misconception: 'MC-flux-sin-for-cos', lesson: '1.7' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await fillAndCheck(q, input, '520');
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident wrong answer about an outside charge is recorded as a misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.7-outside-charge"]');
    await q.scrollIntoViewIfNeeded();
    await pickAndCheck(q, 1);
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.7-outside-charge', confident: true, misconception: 'MC-gauss-outside-charge-counts' });
  });
});

test.describe('lesson completion', () => {
  test('finishing stamps the lesson', async ({ page }) => {
    await page.goto(LESSON);
    const end = page.getByRole('button', { name: /סיימתי את השיעור/ });
    await end.scrollIntoViewIfNeeded();
    await end.click();
    await expect(page.locator('.stamp')).toBeVisible();
    await page.goto('/');
    await expect(page.locator('[data-lesson-id="1.7"]')).toHaveClass(/completed/);
  });
});
