import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-3/';

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

  test('all four figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(4);
    for (let i = 0; i < 4; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('straight above the charge ∂V/∂x is zero while the field is not, and a small step turns ΔV/Δx into ∂V/∂x', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-3a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('P = (0.15, 0.22) m');
    await expect(readout).toContainText('V(P) = 33.8 V');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowLeft');
    await expect(readout).toContainText('P = (0, 0.22) m');
    await expect(readout).toContainText('∂V/∂x = 0 V/m');
    // E = kQ/r² straight up: 9/0.0484 ≈ 186 N/C
    await expect(readout).toContainText('E = (0, 186) N/C');
    expect((await progress(page)).tasks['fig-6-3a:zero-x']).toBeTruthy();
    await setSlider(fig.locator('input[type=range]'), 5);
    await expect(readout).toContainText('Δx = 0.5 cm');
    expect((await progress(page)).tasks['fig-6-3a:shrink']).toBeTruthy();
    await fig.getByRole('button', { name: '∂/∂y' }).click();
    await expect(readout).toContainText('∂V/∂y = −186 V/m');
    await noSideways(page);
  });

  test('cylindrical coordinates s = 2, φ = 90°, z = 1 put P at (0, 2, 1)', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-3b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('(x, y, z) = (2, 1.5, 2) m');
    await expect(readout).toContainText('s = 2.5 m');
    await fig.getByRole('button', { name: 'גליליות' }).click();
    const sliders = fig.locator('input[type=range]');
    await setSlider(sliders.nth(0), 2);
    await setSlider(sliders.nth(1), 90);
    await setSlider(sliders.nth(2), 1);
    await expect(readout).toContainText('(x, y, z) = (0, 2, 1) m');
    await expect(readout).toContainText('r = 2.24 m');
    expect((await progress(page)).tasks['fig-6-3b:cyl-target']).toBeTruthy();
    // on the z axis φ has no value
    await setSlider(sliders.nth(0), 0);
    await expect(readout).toContainText('φ = לא מוגדרת');
    expect((await progress(page)).tasks['fig-6-3b:axis']).toBeTruthy();
    await noSideways(page);
  });

  test('products: A·B from components, A×B out of the page, B×A into it', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-3c');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('A·B = 4·1 + 1·3 = 7');
    await fig.getByRole('button', { name: 'מכפלה וקטורית' }).click();
    await expect(readout).toContainText('(A×B)z = 11');
    await expect(readout).toContainText('⊙ החוצה מהדף');
    await fig.getByRole('button', { name: 'B×A' }).click();
    await expect(readout).toContainText('(B×A)z = −11');
    expect((await progress(page)).tasks['fig-6-3c:cross-in']).toBeTruthy();
    // move B to (−1, 4), perpendicular to A = (4, 1)
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press(' ');
    await canvas.press(' ');
    await canvas.press('ArrowLeft');
    await canvas.press('ArrowLeft');
    await canvas.press('ArrowUp');
    await expect(readout).toContainText('B = (−1, 4)');
    await expect(readout).toContainText('= 0');
    expect((await progress(page)).tasks['fig-6-3c:dot-zero']).toBeTruthy();
    await noSideways(page);
  });

  test('moving the origin changes r and r′ but not R = r − r′ or E; a negative charge flips E only', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-3d');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('r = (0.7, 0.5) m');
    await expect(readout).toContainText('R = r − r′ = (0, 0.5) m');
    await expect(readout).toContainText('E = (0, 72) N/C');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    // space selects the origin; shift+arrow moves it 5 cm
    await canvas.press(' ');
    await canvas.press('Shift+ArrowRight');
    await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('r = (0.6, 0.5) m');
    await expect(readout).toContainText('R = r − r′ = (0, 0.5) m');
    await expect(readout).toContainText('E = (0, 72) N/C');
    expect((await progress(page)).tasks['fig-6-3d:move-origin']).toBeTruthy();
    await fig.getByRole('button', { name: 'מטען שלילי' }).click();
    await expect(readout).toContainText('R = r − r′ = (0, 0.5) m');
    await expect(readout).toContainText('E = (0, −72) N/C');
    expect((await progress(page)).tasks['fig-6-3d:negative-q']).toBeTruthy();
    await noSideways(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-6-3"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', {
      hasText: 'כמעט לא משתנה',
    });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: using the position of the field point from the origin gets targeted feedback, then 86.4 N/C passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.3-coulomb-ex"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('38.4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('כאילו המטען בראשית');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('86.4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSideways(page);
  });

  test('a confident "the distance is the difference of the distances" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.3-distance"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    // the choice "1 m" is KaTeX; its MathML annotation carries the TeX source
    await q
      .locator('.q-choices')
      .first()
      .locator('label', { hasText: String.raw`1\,\text{m}` })
      .click();
    await q.locator('.reasons label', { hasText: 'הפרש המרחקים שלהן מהראשית' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({
      qid: 'Q-6.3-distance',
      correct: false,
      confident: true,
      misconception: 'MC-separation-magnitude-difference',
    });
  });
});
