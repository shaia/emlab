import { expect, test, type Locator, type Page } from '@playwright/test';

const LESSON = '/lessons/1-8/';

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

test.describe('shell field (1.8א)', () => {
  test('outside the shell E falls as 1/r², inside it is zero', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-8a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect.poll(() => inked(fig.locator('canvas'))).toBeGreaterThan(200);
    // r = 0.7 m, Q = 2 μC: E = kQ/r² = 3.67·10⁴ N/C
    await setRange(page, 'fig-1-8a', 0, 0.7);
    await setRange(page, 'fig-1-8a', 1, 2);
    await expect(readout).toContainText('q = +2 μC');
    await expect(readout).toContainText('3.67·10⁴');
    await setRange(page, 'fig-1-8a', 0, 0.8);
    await expect(readout).toContainText('2.81·10⁴');
    await setRange(page, 'fig-1-8a', 0, 0.25);
    await expect(readout).toContainText('q = 0 μC');
    await expect(readout).toContainText('E = 0 N/C');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-8a:inside-zero']).toBeTruthy();
  });

  test('a negative shell makes the field point inward', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-8a');
    await fig.scrollIntoViewIfNeeded();
    // text steps scrolled into view also drive the figure: set the charge until it holds
    await expect(async () => {
      await setRange(page, 'fig-1-8a', 0, 0.7);
      await setRange(page, 'fig-1-8a', 1, -2);
      await expect(fig.locator('.sim-readout')).toContainText('(פנימה)', { timeout: 1000 });
    }).toPass({ timeout: 10000 });
  });
});

test.describe('plates field (1.8ב)', () => {
  test('one plane is σ/2ε₀ at any distance; two opposite plates give σ/ε₀ between and zero outside', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-8b');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect.poll(() => inked(fig.locator('canvas'))).toBeGreaterThan(200);
    // σ = 2 μC/m²: σ/2ε₀ = 1.13·10⁵ N/C
    await fig.getByRole('button', { name: 'לוח אחד' }).click();
    await setRange(page, 'fig-1-8b', 0, 2);
    await expect(readout).toContainText('1.13·10⁵');
    const near = await readout.innerText();
    await setRange(page, 'fig-1-8b', 1, -0.95);
    await expect(readout).toContainText('1.13·10⁵');
    expect(near).toContain('1.13·10⁵');
    await fig.getByRole('button', { name: 'שני לוחות: + ו-−' }).click();
    await expect(readout).toContainText('בין הלוחות: E = 2.26·10⁵');
    await expect(readout).toContainText('משמאל ללוחות: E = 0');
    await expect(readout).toContainText('מימין ללוחות: E = 0');
    await fig.getByRole('button', { name: 'שני לוחות: שניהם +' }).click();
    await expect(readout).toContainText('בין הלוחות: E = 0');
    await expect(readout).toContainText('מימין ללוחות: E = 2.26·10⁵');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens after committing to "zero"', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-8"]');
    await predict.scrollIntoViewIfNeeded();
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    // the island hydrates when it scrolls into view: retry until the choice registers
    await expect(async () => {
      await predict.locator('label.q-choice').nth(1).click({ timeout: 2000 });
      await expect(commit).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('plane vs plates factor 2 is caught with targeted feedback', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.8-plane-numeric"]');
    await q.scrollIntoViewIfNeeded();
    const input = q.locator('input[type=text]');
    await fillAndCheck(q, input, '3.39e5');
    await expect(q.locator('.q-feedback')).toContainText('בין שני לוחות');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.8-plane-numeric', correct: false, misconception: 'MC-plane-factor-two', lesson: '1.8' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await fillAndCheck(q, input, '1.7e5');
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident wrong answer about the field inside a shell is recorded', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.8-shell-inside"]');
    await q.scrollIntoViewIfNeeded();
    await pickAndCheck(q, 1);
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.8-shell-inside', confident: true, misconception: 'MC-shell-inside-field' });
  });
});

test.describe('lesson completion', () => {
  test('finishing stamps the lesson', async ({ page }) => {
    test.slow();
    await page.goto(LESSON);
    const end = page.getByRole('button', { name: /סיימתי את השיעור/ });
    await end.scrollIntoViewIfNeeded();
    await end.click();
    await expect(page.locator('.stamp')).toBeVisible();
    await page.goto('/');
    await expect(page.locator('[data-lesson-id="1.8"]')).toHaveClass(/completed/);
  });
});
