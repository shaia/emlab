import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-16/';

/** the slider holds log10 of the free length in metres */
const setLength = (fig: Locator, metres: number) =>
  fig.locator('input[type=range]').evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, Math.log10(metres));

async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-16a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const noSidewaysScroll = async (page: Page) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sw).toBeLessThanOrEqual(0);
};

test.describe('limit lab', () => {
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

  test('the figure draws, in LTR physics space, and starts on the ring at z = R', async ({ page }) => {
    const fig = await openFigure(page);
    const c = fig.locator('.sim-stage canvas');
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('z = 10 cm');
    await expect(readout).toContainText('E = 1590 N/C');
    await expect(readout).toContainText('0.354');
  });

  test('ring: far away the exact field becomes kQ/z²', async ({ page }) => {
    const fig = await openFigure(page);
    // the slider moves in steps of 0.01 in log10: 10^0.2 m = 1.58 m
    await setLength(fig, 10 ** 0.2);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('z/R = 15.8');
    await expect(readout).toContainText('יחס 0.994');
    await expect(readout).toContainText('-1.99');
    expect((await progress(page)).tasks['fig-6-16a:far-ring']).toBeTruthy();
  });

  test('disc: a wide disc is the infinite plane', async ({ page }) => {
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'דיסקה', exact: true }).click();
    await setLength(fig, 2);
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('σ/(2ε₀) = 565 N/C');
    await expect(readout).toContainText('0.975');
    expect((await progress(page)).tasks['fig-6-16a:wide-disc']).toBeTruthy();
  });

  test('solenoid: the flat coil at one end, the long solenoid at the other', async ({ page }) => {
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'סליל', exact: true }).click();
    const readout = fig.locator('.sim-readout');
    await setLength(fig, 1e-3);
    await expect(readout).toContainText('μ₀NI/(2R) = 5.03·10⁻³ T');
    expect((await progress(page)).tasks['fig-6-16a:flat-coil']).toBeTruthy();
    expect((await progress(page)).tasks['fig-6-16a:long-solenoid']).toBeFalsy();
    await setLength(fig, 5);
    expect((await progress(page)).tasks['fig-6-16a:long-solenoid']).toBeTruthy();
  });

  test('the suspect formula passes the long solenoid and is caught, twice too big, at the flat coil; the task wants another body', async ({ page }) => {
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'סליל', exact: true }).click();
    await setLength(fig, 5);
    const toggle = fig.getByRole('button', { name: 'נוסחה חשודה' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('μ₀NI/√(L² + R²)');
    expect((await progress(page)).tasks['fig-6-16a:catch-suspect']).toBeFalsy();
    await setLength(fig, 1e-3);
    await expect(readout).toContainText('חלקי המדויק 2.000');
    // the solenoid's suspect is the one the text already shows: the task asks for another body
    expect((await progress(page)).tasks['fig-6-16a:catch-suspect']).toBeFalsy();
    await fig.getByRole('button', { name: 'מוט', exact: true }).click();
    await setLength(fig, 10);
    await expect(readout).toContainText('kλL/(r² + L²/4)');
    expect((await progress(page)).tasks['fig-6-16a:catch-suspect']).toBeTruthy();
    await noSidewaysScroll(page);
  });

  test('keyboard: the arrows walk the length along the log axis', async ({ page }) => {
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'דיפול', exact: true }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('r = 1 cm');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 2; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('r = 10 cm');
    await expect(readout).toContainText('-3.01');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-16"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'הוא נכון: לסליל ארוך' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: forgetting the 4 gets targeted feedback, then 19.9 passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.16-solenoid-length"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('9.96');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('שכחתם את ה-4');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('19.9');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSidewaysScroll(page);
  });

  test('a confident "one limit is enough" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.16-suspect-ring"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'כן: הוא עובר את בדיקת היחידות' }).click();
    await q.locator('.reasons label', { hasText: 'וזה מה שבודקים' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.16-suspect-ring', correct: false, confident: true, misconception: 'MC-one-limit-enough' });
  });
});
