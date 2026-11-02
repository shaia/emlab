import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-6/';

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

// slider stops (see VelocitySelector.tsx): E = 3…10·10⁴ V/m, B = 0.05/0.08/0.1 T, v = 2…10·10⁵ in steps of 0.5·10⁵, B′ = 0.2…0.5 T
const E_INDEX = (E: number) => E / 1e4 - 3;
const V_INDEX = (v: number) => (v / 1e5 - 2) * 2;

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
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('only v = E/B goes straight: faster bends to the magnetic side, any ion passes at E/B', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-6a');
    const readout = fig.locator('.sim-readout');
    const [E, , v] = [0, 1, 2].map((i) => fig.locator('input[type=range]').nth(i));
    // E = 5·10⁴ V/m, B = 0.1 T, v = 5·10⁵ m/s: the proton passes
    await expect(readout).toContainText('v = E/B = 5·10⁵ m/s');
    await expect(readout).toContainText('עובר ישר בסדק');
    await expect(readout).toContainText('F = qE = 8·10⁻¹⁵ N');
    // faster than E/B: the magnetic force (up, palm rule) wins
    await setSlider(v, V_INDEX(6e5));
    await expect(readout).toContainText('F = qvB = 9.6·10⁻¹⁵ N');
    await expect(readout).toContainText(/העליון|מעל הסדק/);
    // slower: the electric force (down) wins
    await setSlider(v, V_INDEX(4e5));
    await expect(readout).toContainText(/התחתון|מתחת לסדק/);
    // a new selector setting: E = 8·10⁴ V/m selects 8·10⁵ m/s
    await setSlider(E, E_INDEX(8e4));
    await setSlider(v, V_INDEX(8e5));
    await expect(readout).toContainText('v = E/B = 8·10⁵ m/s');
    await expect(readout).toContainText('עובר ישר בסדק');
    // an alpha particle and a negative ion pass at the same speed
    await fig.getByRole('button', { name: /חלקיק אלפא/ }).click();
    await expect(readout).toContainText('עובר ישר בסדק');
    await fig.getByRole('button', { name: /יון מימן שלילי/ }).click();
    await expect(readout).toContainText('עובר ישר בסדק');
    const tasks = (await progress(page)).tasks;
    for (const t of ['balance-new', 'other-ion', 'too-fast']) expect(tasks[`fig-4-6a:${t}`]).toBeTruthy();
  });

  test('flipping the plates makes both forces point the same way: nothing passes', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-6a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: /הפכו את הלוחות/ }).click();
    await expect(readout).toContainText('פוגע בלוח העליון');
    await fig.getByRole('button', { name: 'קרן עם מהירויות שונות' }).click();
    await expect(readout).toContainText('אף מהירות בקרן לא עוברת בסדק');
  });

  test('Bainbridge: deuterons land twice as far as protons, alpha particles with the deuterons', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-6b');
    const readout = fig.locator('.sim-readout');
    // v = 5·10⁵ m/s, B′ = 0.2 T: 2r = 5.22 cm (p) and 10.4 cm (d)
    await expect(readout).toContainText('עוברים בסדק: v = 5·10⁵ m/s');
    await expect(readout).toContainText('פוגע 5.22 ס"מ מעל הסדק');
    await expect(readout).toContainText('פוגע 10.4 ס"מ מעל הסדק');
    await fig.getByRole('button', { name: /חלקיק אלפא/ }).click();
    await expect(readout.locator('span', { hasText: 'חלקיק אלפא' })).toContainText('פוגע 10.4 ס"מ');
    // B′ = 0.4 T halves every distance
    await setSlider(fig.locator('input[type=range]').nth(2), 2);
    await expect(readout).toContainText('פוגע 2.61 ס"מ מעל הסדק');
    await expect(readout).toContainText('פוגע 5.22 ס"מ מעל הסדק');
    const tasks = (await progress(page)).tasks;
    for (const t of ['two-spots', 'alpha-d', 'change-b2']) expect(tasks[`fig-4-6b:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-6"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    // a choice clicked before the island hydrates lands in the static HTML and is lost
    const choice = predict.locator('label.q-choice', { hasText: 'כי הוא כבד יותר' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: a distance left in centimetres gets targeted feedback, then 6·10⁵ m/s passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.6-speed"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('6000');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('בסנטימטרים');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('600000');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "the alpha particle needs another speed" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.6-alpha-same"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'כי המטען שלו כפול' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.6-alpha-same', correct: false, confident: true, misconception: 'MC-selector-depends-on-mass', lesson: '4.6' });
  });
});
