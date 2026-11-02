import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-6/';

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

const noSideways = async (page: Page) => {
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

  test('a conservative field: path 2 round the far side of the charge gives the same integral as the straight path', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-6a');
    const readout = fig.locator('.sim-readout');
    // V(A) − V(B) = 3.26·10⁴ V, and both paths give it
    await expect(readout).toContainText('V(A) − V(B) = 3.26·10⁴ V');
    await expect(readout.getByText('∫E·dl = 3.26·10⁴ V')).toHaveCount(2);
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // drag path 2's midpoint from (0, 50 cm) to (−30 cm, −40 cm): below the charge
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowLeft');
    for (let i = 0; i < 9; i++) await canvas.press('Shift+ArrowDown');
    await expect(readout.getByText('∫E·dl = 3.26·10⁴ V')).toHaveCount(2);
    await expect(readout).toContainText('∮E·dl = 0 V');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-6-6a:other-side']).toBeTruthy();
    expect(tasks['fig-6-6a:bend-path']).toBeTruthy();
  });

  test('the swirl field is not conservative: the two integrals differ and there is no potential', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-6a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'שדה מערבולת', exact: true }).click();
    await expect(readout).toContainText('לשדה הזה אין פוטנציאל');
    await expect(readout).toContainText('∫E·dl = -5.1·10⁴ V');
    await expect(readout).toContainText('∫E·dl = -1.36·10⁵ V');
    await fig.locator('canvas').focus();
    await fig.locator('canvas').press('Shift+ArrowDown');
    expect((await progress(page)).tasks['fig-6-6a:swirl']).toBeTruthy();
  });

  test('−∇V from the potential equals E from Coulomb, and the step finds the level and the steepest directions', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-6b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('(מהפוטנציאל): 1.67·10⁵ N/C, ימינה');
    await expect(readout).toContainText('(מחוק קולון): 1.67·10⁵ N/C, ימינה');
    const ccw = fig.getByRole('button', { name: '↺ סיבוב הצעד' });
    // the step starts at 45°; ∇V points at about 184.5°, so 90° runs along the equipotential
    for (let i = 0; i < 9; i++) await ccw.click();
    expect((await progress(page)).tasks['fig-6-6b:level']).toBeTruthy();
    for (let i = 0; i < 19; i++) await ccw.click();
    await expect(readout).toContainText('dV/ds = 1.67·10⁵ V/m');
    expect((await progress(page)).tasks['fig-6-6b:steepest']).toBeTruthy();
    await fig.locator('canvas').focus();
    for (let i = 0; i < 2; i++) await fig.locator('canvas').press('Shift+ArrowUp');
    expect((await progress(page)).tasks['fig-6-6b:compare']).toBeTruthy();
    await noSideways(page);
  });

  test('the ring axis: −dV/dz equals the vector sum, zero at the centre, largest at R/√2; a wide disc gives σ/(2ε₀)', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-6c');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('V = 125 V');
    await expect(readout).toContainText('E_z = −dV/dz = 288 N/C');
    await expect(readout).toContainText('(שיעור 6.4): E_z = 288 N/C');
    const [R, z] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
    await setSlider(z, 0);
    await expect(readout).toContainText('V = 225 V');
    await expect(readout).toContainText('dV/dz = 0 V/m');
    await setSlider(z, 14);
    await expect(readout).toContainText('433 N/C');
    let tasks = (await progress(page)).tasks;
    expect(tasks['fig-6-6c:ring-centre']).toBeTruthy();
    expect(tasks['fig-6-6c:ring-peak']).toBeTruthy();
    await fig.getByRole('button', { name: 'דיסקה', exact: true }).click();
    await setSlider(R, 30);
    await setSlider(z, 2);
    await expect(readout).toContainText('E_z/(σ/2ε₀) = 0.93');
    tasks = (await progress(page)).tasks;
    expect(tasks['fig-6-6c:disc-wide']).toBeTruthy();
    await noSideways(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-6"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'המטען כלוא בין המסלולים' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: field times path length gets targeted feedback, then 120 V passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.6-point-integral"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('360');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('בנקודה הקרובה');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('120');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSideways(page);
  });

  test('a confident "the enclosed charge changes the integral" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.6-two-paths"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'המטען כלוא בין המסלולים' }).click();
    await q.locator('.reasons label', { hasText: 'סביב מסלול סגור שמקיף מטען' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-6.6-two-paths', correct: false, confident: true, misconception: 'MC-lineint-enclosed-charge-counts' });
  });
});
