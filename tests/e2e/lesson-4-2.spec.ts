import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-2/';

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

/** Move the selected item (P unless a wire was picked) with the arrow keys: 5 mm a press, 2 cm with shift. */
async function press(fig: Locator, key: string, times: number, shift = false) {
  const canvas = fig.locator('.sim-stage canvas');
  await canvas.focus();
  for (let i = 0; i < times; i++) await canvas.press(shift ? `Shift+${key}` : key);
}

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
    await expect(canvases).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('Oersted: turning the current on and reversing it ticks both tasks, and the field at P flips', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-2a');
    const readout = fig.locator('.sim-readout');
    // no current: only the Earth's 32 μT, northward
    await expect(readout).toContainText('B = 32 μT');
    const slider = fig.locator('input[type=range]').first();
    await setSlider(slider, 10);
    expect((await progress(page)).tasks['fig-4-2a:current-on']).toBeTruthy();
    // P is 4 cm east of a 10 A wire (⊙): the wire adds 50 μT north to the Earth's 32 μT
    await expect(readout).toContainText('B = 82 μT');
    await expect(readout).toContainText('צפונה');
    await setSlider(slider, -10);
    expect((await progress(page)).tasks['fig-4-2a:reverse']).toBeTruthy();
    // into the page (⊗): the wire's 50 μT now points south and outweighs the Earth's field
    await expect(readout).toContainText('B = 18 μT');
    await expect(readout).toContainText('דרומה');
  });

  test('the field of a lone wire halves at twice the distance, and doubles with twice the current', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-2a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'השדה של כדור הארץ' }).click();
    await setSlider(fig.locator('input[type=range]').first(), 10);
    await expect(readout).toContainText('B = 50 μT');
    await expect(readout).toContainText('r = 4 cm');
    await press(fig, 'ArrowRight', 8);
    await expect(readout).toContainText('r = 8 cm');
    await expect(readout).toContainText('B = 25 μT');
    expect((await progress(page)).tasks['fig-4-2a:halve-field']).toBeTruthy();
    await setSlider(fig.locator('input[type=range]').first(), 20);
    await expect(readout).toContainText('B = 50 μT');
    expect((await progress(page)).tasks['fig-4-2a:double-current']).toBeTruthy();
  });

  test('two like currents cancel midway; flipping one doubles the field there', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-2b');
    const readout = fig.locator('.sim-readout');
    // P starts 7 cm above the midpoint; 14 presses of 5 mm bring it down to the midpoint
    await press(fig, 'ArrowDown', 14);
    await expect(readout).toContainText('B = 0 μT');
    expect((await progress(page)).tasks['fig-4-2b:null-wires']).toBeTruthy();
    await setSlider(fig.locator('input[type=range]').nth(1), -10);
    // each wire is 8 cm away: 25 μT each, both upward
    await expect(readout).toContainText('B = 50 μT');
    await expect(readout).toContainText('למעלה');
    expect((await progress(page)).tasks['fig-4-2b:flip-one']).toBeTruthy();
  });

  test('a wire in the Earth’s field has a null point on its west side', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-2b');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'תיל ושדה כדור הארץ' }).click();
    // the wire (10 A, ⊙) is at x = 3 cm; P starts at (8, 7) cm. Move it to (−3, 0) cm, 6 cm west of the wire,
    // where the wire's 33.3 μT southward nearly cancels the Earth's 32 μT
    await press(fig, 'ArrowLeft', 5, true);
    await press(fig, 'ArrowLeft', 2);
    await press(fig, 'ArrowDown', 3, true);
    await press(fig, 'ArrowDown', 2);
    await expect(readout).toContainText('B = 1.33 μT');
    expect((await progress(page)).tasks['fig-4-2b:null-earth']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-2"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    // a choice clicked before the island hydrates lands in the static HTML and is lost
    const choice = predict.locator('label.q-choice', { hasText: 'ישר אל התיל' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: dividing by r² gets targeted feedback, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.2-B-calc"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('833');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('חילקתם');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.2-B-calc', correct: false, misconception: 'MC-wire-field-inverse-square', lesson: '4.2' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('50');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('vector: a radial answer is recorded as that misconception, then the tangent passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.2-end-on-right"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: 'ימינה', exact: true }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-4.2-end-on-right', misconception: 'MC-wire-field-radial' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.getByRole('radio', { name: 'למעלה', exact: true }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });
});
