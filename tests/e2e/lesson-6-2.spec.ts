import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-2/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page, id: string) {
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const noSidewaysScroll = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

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
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('five left rectangles under v = 2t give 80 m of the true 100 m; midpoint and trapezoid are exact on a line', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-2a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('סכום רימן, כלל שמאלי: 80 m');
    await expect(readout).toContainText('השטח המדויק (הדרך): 100 m');
    await fig.getByRole('button', { name: 'ימני' }).click();
    await expect(readout).toContainText('120 m');
    await fig.getByRole('button', { name: 'נקודת אמצע' }).click();
    await expect(readout).toContainText('בכלל הזה השגיאה אפס');
    await fig.getByRole('button', { name: 'טרפז' }).click();
    await expect(readout).toContainText('סכום רימן, כלל טרפז: 100 m');
    expect((await progress(page)).tasks['fig-6-2a:all-rules']).toBeTruthy();
  });

  test('on x², doubling N quarters the midpoint error; the left sum needs N ≥ 150 for 1%', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-2a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'x²' }).click();
    await fig.getByRole('button', { name: 'נקודת אמצע' }).click();
    await setSlider(fig.locator('input[type=range]').first(), 20);
    await expect(readout).toContainText('קטנה פי 4');
    await fig.getByRole('button', { name: 'N כפול' }).click();
    await expect(readout).toContainText('N = 40');
    await fig.getByRole('button', { name: 'שמאלי' }).click();
    await setSlider(fig.locator('input[type=range]').first(), 149);
    let tasks = (await progress(page)).tasks;
    expect(tasks['fig-6-2a:left-1pct']).toBeFalsy();
    await setSlider(fig.locator('input[type=range]').first(), 150);
    tasks = (await progress(page)).tasks;
    expect(tasks['fig-6-2a:double-mid']).toBeTruthy();
    expect(tasks['fig-6-2a:left-1pct']).toBeTruthy();
  });

  test('the velocity graph: displacement −5 m, distance 13 m, back at the start at t = 4 s', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-2b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('השטח המדויק (ההעתק): -5 m');
    await expect(readout).toContainText('הדרך שהמכונית עברה: 13 m');
    // b runs in 200 steps over [0, 5]: 160 steps is t = 4 s
    await setSlider(fig.locator('input[type=range]').nth(1), 4);
    await expect(readout).toContainText(/ההעתק\): -?(0|[\d.]+·10⁻\d+) m/);
    expect((await progress(page)).tasks['fig-6-2b:return-time']).toBeTruthy();
  });

  test('the physics graphs read work in J, charge in mC and energy in μJ', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-2b');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'כוח קולון' }).click();
    await expect(readout).toContainText('השטח המדויק (עבודת הכוח החשמלי): 0.144 J');
    await fig.getByRole('button', { name: 'זרם פריקה' }).click();
    await expect(readout).toContainText('השטח המדויק (המטען שעבר): 1.19 mC');
    await fig.getByRole('button', { name: 'מתח על קבל' }).click();
    await expect(readout).toContainText('השטח המדויק (האנרגיה האגורה): 360 μJ');
    await fig.getByRole('button', { name: 'מהירות: הלוך וחזור' }).click();
    expect((await progress(page)).tasks['fig-6-2b:physics-units']).toBeTruthy();
  });

  test('the area under v = 4 − 2t peaks at t = 2 s, where its slope v is 0', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-2c');
    const readout = fig.locator('.sim-readout');
    const b = fig.locator('input[type=range]').first();
    await setSlider(b, 2);
    await expect(readout).toContainText('A(b) = 4 m');
    await expect(readout).toContainText('f(b) = 0');
    expect((await progress(page)).tasks['fig-6-2c:peak']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-2"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await hydrated(predict.locator('label.q-choice').first());
    await predict.locator('label.q-choice', { hasText: 'קטנה מהדרך האמיתית' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: "substitute into f" is caught as that misconception, then 15 passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.2-ftc-numeric"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('28');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.2-ftc-numeric', correct: false, misconception: 'MC-ftc-uses-f', lesson: '6.2' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('15');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the distance is the displacement" is recorded as the always-positive-area misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.2-signed-velocity"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: '16' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.2-signed-velocity', correct: false, confident: true, misconception: 'MC-integral-area-always-positive' });
    await noSidewaysScroll(page);
  });

  test('opening every worked solution never widens the page', async ({ page }) => {
    await page.goto(LESSON);
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => d.setAttribute('open', '')));
    await noSidewaysScroll(page);
  });
});
