import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-10/';

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

const noSidewaysScroll = async (page: Page) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sw).toBeLessThanOrEqual(0);
};

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

  test('the three figures draw, in LTR physics space', async ({ page }) => {
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

  test('zoom: close to the positive charge the slope is −2, far from the dipole it is −3', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-10a');
    const readout = fig.locator('.sim-readout');
    const slider = fig.locator('input[type=range]');
    // 0.3 mm from the positive charge
    await setSlider(slider, Math.log10(0.0003));
    await expect(readout).toContainText('−2.0');
    expect((await progress(page)).tasks['fig-6-10a:near']).toBeTruthy();
    // 2 m away: 2kp/R³ with R from the centre, and the exact field agree to 0.0x%
    await setSlider(slider, Math.log10(2));
    await expect(readout).toContainText('השיפוע בגרף ב-P: −2.99');
    expect((await progress(page)).tasks['fig-6-10a:far']).toBeTruthy();
    await fig.getByRole('button', { name: 'על האנך האמצעי' }).click();
    await expect(readout).toContainText('המרחק מהמרכז');
    await expect(readout).toContainText('−3.00');
    // kp/r³ at 2 m for p = 2·10⁻¹¹ C·m
    await expect(readout).toContainText('kp/r³ = 0.0225 N/C');
    expect((await progress(page)).tasks['fig-6-10a:bisector']).toBeTruthy();
    await noSidewaysScroll(page);
  });

  test('a dipole in a uniform field: maximum torque at 90°, zero at 180°, and no net force', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-10b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('θ = 50°');
    await expect(readout).toContainText('והכוח השקול 0');
    const slider = fig.locator('input[type=range]');
    await setSlider(slider, 90);
    // pE = 2·10⁻¹⁰ · 3·10⁴
    await expect(readout).toContainText('τ = pE·sinθ = 6·10⁻⁶ N·m');
    await expect(readout).toContainText('U = −pE·cosθ = 0 J');
    expect((await progress(page)).tasks['fig-6-10b:max-torque']).toBeTruthy();
    await setSlider(slider, 180);
    await expect(readout).toContainText('τ = pE·sinθ = 0 N·m');
    await expect(readout).toContainText('6·10⁻⁶ J');
    expect((await progress(page)).tasks['fig-6-10b:unstable']).toBeTruthy();
  });

  test('released from 50°, the dipole comes to rest along the field (still mode shows the rest position)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('emlab:settings', JSON.stringify({ still: true, theme: 'auto' })));
    const fig = await openFigure(page, 'fig-6-10b');
    await fig.getByRole('button', { name: 'שחררו את הדיפול' }).click();
    await expect(fig.locator('.sim-readout')).toContainText('θ = 0°');
    expect((await progress(page)).tasks['fig-6-10b:release']).toBeTruthy();
  });

  test('the slab: κ = 5 cuts the field by 5, and the bound layers can be shown', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-10c');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('E = E₀/κ = 1·10⁴ N/C');
    await fig.getByRole('button', { name: 'κ = 5' }).click();
    await expect(readout).toContainText('E = E₀/κ = 6000 N/C');
    expect((await progress(page)).tasks['fig-6-10c:kappa']).toBeTruthy();
    await fig.getByRole('button', { name: 'המטען שעל פני החומר' }).click();
    expect((await progress(page)).tasks['fig-6-10c:bound']).toBeTruthy();
    await fig.getByRole('button', { name: 'בלי חומר' }).click();
    await expect(readout).toContainText('σ = 0 C/m²');
    await noSidewaysScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-10"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'פי 4' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: 2kp/r² gets the 1/r² feedback, then 16 N/C passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.10-axis-field"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('2.4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('1/r^3');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('16');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the field halves four times" is recorded as the 1/r² misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.10-double-distance"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'כמו בחוק קולון' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.10-double-distance', correct: false, confident: true, misconception: 'MC-dipole-field-inverse-square' });
    await noSidewaysScroll(page);
  });
});
