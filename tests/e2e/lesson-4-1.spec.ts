import { expect, test, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/4-1/';

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

/** Move the selected object with the keyboard: the canvas takes focus, space selects, arrows move by 1 cm. */
async function nudge(page: Page, canvas: ReturnType<Page['locator']>, key: string, times: number, shift = false) {
  await canvas.focus();
  for (let i = 0; i < times; i++) await page.keyboard.press(shift ? `Shift+${key}` : key);
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

  test('breaking the magnet gives two whole magnets, and the task ticks', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-1a');
    await expect(fig.getByRole('button', { name: 'שברו את המגנט' })).toBeVisible();
    await fig.getByRole('button', { name: 'שברו את המגנט' }).click();
    await expect(fig.getByRole('button', { name: 'שברו את המגנט' })).toHaveCount(0);
    await expect(fig.locator('canvas')).toHaveAttribute('aria-label', /2 מגנטים/);
    expect((await progress(page)).tasks['fig-4-1a:break']).toBeTruthy();
  });

  test('the compass visits both poles and the task ticks; next to N the needle points away from the magnet', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-1a');
    const canvas = fig.locator('canvas');
    const readout = fig.locator('.sim-readout');
    // the compass starts at (17, 11) cm; the magnet (12 cm long) lies on the x axis with N at x = +6 cm
    await canvas.focus();
    await page.keyboard.press('Space'); // selects the compass
    await nudge(page, canvas, 'ArrowDown', 11); // (17, 0): on the axis, 11 cm beyond N
    await expect(readout).toContainText('(ימינה)');
    await nudge(page, canvas, 'ArrowLeft', 7); // (10, 0): 4 cm from N
    // now go round to the S pole at x = −6 cm, below the magnet
    await nudge(page, canvas, 'ArrowDown', 6);
    await nudge(page, canvas, 'ArrowLeft', 20); // (−10, −6)
    await nudge(page, canvas, 'ArrowUp', 6); // (−10, 0): 4 cm beyond S, on the axis
    await expect(readout).toContainText('(ימינה)'); // toward S, i.e. into the magnet
    expect((await progress(page)).tasks['fig-4-1a:compass-poles']).toBeTruthy();
  });

  test('flipping one of two like magnets makes them unlike, and the task ticks', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-1a');
    await fig.getByRole('button', { name: 'קטבים שווים' }).click();
    await expect(fig.getByRole('button', { name: 'הפכו את המגנט הימני' })).toBeVisible();
    // midway between two N poles the field cancels: the compass at (0, 10) cm feels the sideways push only
    await fig.getByRole('button', { name: 'הפכו את המגנט הימני' }).click();
    expect((await progress(page)).tasks['fig-4-1a:flip']).toBeTruthy();
    await expect(fig.locator('.sim-readout')).toContainText('B =');
  });

  test('the Earth figure: the needle turns 42° east, reaches 45° closer in, and the task ticks', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-1b');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('B = 3.2·10⁻⁵ T');
    await fig.getByRole('button', { name: 'מגנט ושדה כדור הארץ' }).click();
    // magnet at x = −18 cm pointing east, compass on its axis at x = +10 cm: B_m ≈ 2.91·10⁻⁵ T, tanθ = 2.91/3.2
    await expect(readout).toContainText('42°');
    await expect(readout).toContainText('מזרחה');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await page.keyboard.press('Space');
    await nudge(page, canvas, 'ArrowLeft', 1); // 1 cm closer: B_m grows past B_E
    await expect(readout).toContainText(/4[4-7]°/);
    expect((await progress(page)).tasks['fig-4-1b:deflect-45']).toBeTruthy();
  });

  test('the Earth figure: at the null point below the N pole the compass loses its direction', async ({ page }) => {
    const fig = await openFigure(page, 'fig-4-1b');
    await fig.getByRole('button', { name: 'מגנט ושדה כדור הארץ' }).click();
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await page.keyboard.press('Space');
    // from (10, 0) to (−4, −19) cm: the null point found by src/physics/magnets.ts
    await nudge(page, canvas, 'ArrowLeft', 14);
    await nudge(page, canvas, 'ArrowDown', 19);
    expect((await progress(page)).tasks['fig-4-1b:find-null']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-4-1"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'רק קוטב צפוני' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the swapped tangent is caught, then 36.9° passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.1-deflection"]');
    await q.scrollIntoViewIfNeeded();
    await expect(page.locator('astro-island:not([ssr]) [data-qid="Q-4.1-deflection"]')).toHaveCount(1);
    const input = q.locator('input[type=text]');
    await input.fill('53.1');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הפכתם את השבר');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('36.9');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "north magnetic pole in the north" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-4.1-geo-north"]');
    await q.scrollIntoViewIfNeeded();
    await expect(page.locator('astro-island:not([ssr]) [data-qid="Q-4.1-geo-north"]')).toHaveCount(1);
    await q.locator('label', { hasText: 'קוטב צפוני מגנטי, ולכן' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-4.1-geo-north', correct: false, confident: true, misconception: 'MC-compass-points-to-magnetic-north', lesson: '4.1' });
  });
});
