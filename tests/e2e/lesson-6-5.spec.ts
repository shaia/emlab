import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-5/';

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

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(2);
    for (const c of await canvases.all()) {
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('patches: one per face overshoots to 216; more patches approach Q/ε₀ = 113', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-5a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('ΣE·ΔA = 216 N·m²/C');
    await expect(readout).toContainText('/ε₀ = 113 N·m²/C');
    await setSlider(fig.locator('input[type=range]'), 8);
    await expect(readout).toContainText('ΣE·ΔA = 114 N·m²/C');
    expect((await progress(page)).tasks['fig-6-5a:refine']).toBeTruthy();
  });

  test('moving the charge towards a face changes the face fluxes, not the total; outside, the total is zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-5a');
    const readout = fig.locator('.sim-readout');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // shift+arrow moves the charge 5 cm: to x = 15 cm, inside the 40 cm cube
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('ימין 44.1');
    await expect(readout).toContainText('שמאל 8.95');
    await expect(readout).toContainText('/ε₀ = 113 N·m²/C');
    expect((await progress(page)).tasks['fig-6-5a:off-centre']).toBeTruthy();
    for (let i = 0; i < 2; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('/ε₀ = 0 N·m²/C');
    expect((await progress(page)).tasks['fig-6-5a:outside']).toBeTruthy();
    await noSidewaysScroll(page);
  });

  test('cylinder: outside 2kλ/r, inside the field grows with r; the caps carry nothing', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-5b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('E = 2.4·10⁴ N/C');
    await expect(readout).toContainText('דרך הבסיסים: 0');
    await setSlider(fig.locator('input[type=range]'), 0.1);
    await expect(readout).toContainText('E = 1.8·10⁴ N/C');
    await expect(readout).toContainText('בתוך הגוף');
    expect((await progress(page)).tasks['fig-6-5b:cyl-inside']).toBeTruthy();
  });

  test('ball with ρ ∝ r: the field peaks at the surface; outside, the profile does not matter', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-5b');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'כדור', exact: true }).click();
    await fig.getByRole('button', { name: 'ρ ∝ r', exact: true }).click();
    await setSlider(fig.locator('input[type=range]'), 0.2);
    await expect(readout).toContainText('E = 4.5·10⁴ N/C');
    expect((await progress(page)).tasks['fig-6-5b:ball-peak']).toBeTruthy();
    await setSlider(fig.locator('input[type=range]'), 0.3);
    await expect(readout).toContainText('E = 2·10⁴ N/C');
    await fig.getByRole('button', { name: 'ρ ∝ 1/r', exact: true }).click();
    await expect(readout).toContainText('E = 2·10⁴ N/C');
    expect((await progress(page)).tasks['fig-6-5b:same-outside']).toBeTruthy();
    await noSidewaysScroll(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-5"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'כל פאה מקבלת שישית' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the field at the top edge times the area gets targeted feedback, then 8 passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.5-strip-flux"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('24');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('בצלע העליונה');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('8');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSidewaysScroll(page);
  });

  test('a confident "the caps carry flux" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.5-caps"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'דרך כל בסיס' }).click();
    await q.locator('.reasons label', { hasText: 'מתקזזים' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.5-caps', correct: false, confident: true, misconception: 'MC-gauss-caps-carry-flux' });
  });
});
