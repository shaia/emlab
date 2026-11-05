import { expect, test, type Locator, type Page } from '@playwright/test';
import { hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-2/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/**
 * Open a figure in still mode: a push or a switch is then computed at once, so the readouts are
 * deterministic and no test waits on real-time animation.
 */
async function openFigure(page: Page, fig: string) {
  await page.addInitScript(() => localStorage.setItem('emlab:settings', JSON.stringify({ still: true, theme: 'auto' })));
  // helpers.freezeSteps adds its blocking listener after the figures subscribed, and this Chromium runs
  // listeners on window in the order they were added, capture or not: a click that scrolls a step to
  // mid-screen still reset the figure. Register the block first, at document start, and arm it later.
  await page.addInitScript(() =>
    window.addEventListener(
      'emlab:step',
      (e) => {
        if ((window as unknown as { __stepsFrozen?: boolean }).__stepsFrozen) e.stopImmediatePropagation();
      },
      true,
    ),
  );
  await page.goto(LESSON);
  const f = page.locator(`#${fig}`);
  await f.scrollIntoViewIfNeeded();
  await expect(f.locator('astro-island:not([ssr])')).toHaveCount(1);
  await page.evaluate(() => ((window as unknown as { __stepsFrozen?: boolean }).__stepsFrozen = true));
  // a text step may have changed the figure before the freeze: start from its own state
  await f.getByRole('button', { name: 'איפוס' }).click();
  return f;
}

const slider = (fig: Locator, label: string) => fig.locator('label.slider', { hasText: label }).locator('input');
const tasks = async (page: Page) => (await progress(page))?.tasks ?? {};

test.describe('live figure', () => {
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

  test('a push in: the average emf is −NΔΦ/Δt, and with the magnet at rest inside the emf is zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-2a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'הכניסו את המגנט' }).click();
    // ΔΦ = Φ(0) − Φ(−20 cm) = 4.76·10⁻⁵ − 2.8·10⁻⁷ Wb, Δt = 0.6 s, N = 200
    await expect(readout).toContainText('ΔΦ = 47.4 μWb');
    await expect(readout).toContainText('Δt = 0.6 s');
    await expect(readout).toContainText('−NΔΦ/Δt = -15.8 mV');
    await expect(readout).toContainText('במרכז הסליל');
    await expect(readout).toContainText('ε = 0 mV');
    const t = await tasks(page);
    expect(t['fig-5-2a:push-in']).toBeTruthy();
    expect(t['fig-5-2a:hold']).toBeTruthy();
    expect(t['fig-5-2a:pull-out']).toBeFalsy();
  });

  test('pulling out reverses the sign; three times faster gives three times the emf', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-2a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'הכניסו את המגנט' }).click();
    await fig.getByRole('button', { name: 'הוציאו את המגנט' }).click();
    await expect(readout).toContainText('−NΔΦ/Δt = 15.8 mV');
    expect((await tasks(page))['fig-5-2a:pull-out']).toBeTruthy();
    await setSlider(slider(fig, 'משך התנועה'), 0.2);
    await fig.getByRole('button', { name: 'הכניסו את המגנט' }).click();
    await expect(readout).toContainText('−NΔΦ/Δt = -47.4 mV');
    expect((await tasks(page))['fig-5-2a:faster']).toBeTruthy();
  });

  test('twice the turns, twice the emf, the same flux through each turn', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-2a');
    const readout = fig.locator('.sim-readout');
    await setSlider(slider(fig, 'מספר הכריכות'), 400);
    await fig.getByRole('button', { name: 'הכניסו את המגנט' }).click();
    await expect(readout).toContainText('ΔΦ = 47.4 μWb');
    await expect(readout).toContainText('−NΔΦ/Δt = -31.6 mV');
    expect((await tasks(page))['fig-5-2a:turns']).toBeTruthy();
  });

  test('closing and opening the switch of the neighbouring coil kicks the emf both ways, then zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-2b');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'סגרו את המפסק' }).click();
    await expect(readout).toContainText('הזרם בסליל השמאלי: 3 A');
    await expect(readout).toContainText('Φ = 5.59 μWb');
    await expect(readout).toContainText('ε = 0 mV');
    await fig.getByRole('button', { name: 'פתחו את המפסק' }).click();
    await expect(readout).toContainText('Φ = 0 μWb');
    const t = await tasks(page);
    expect(t['fig-5-2b:switch-on']).toBeTruthy();
    expect(t['fig-5-2b:switch-off']).toBeTruthy();
  });

  test('on a frozen graph, −N times the slope of Φ equals the emf recorded at the cursor', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-2b');
    await fig.getByRole('button', { name: 'מגנט וסליל' }).click();
    await fig.getByRole('button', { name: 'הכניסו את המגנט' }).click();
    await fig.getByRole('button', { name: 'עצרו את הגרף' }).click();
    const cursor = slider(fig, 'הסמן על הגרף');
    // the push started 1.5 s into the record and took 0.6 s: put the cursor late in it, where the emf is large
    const max = Number(await cursor.getAttribute('max'));
    await setSlider(cursor, Math.round((max - 0.9) * 100) / 100);
    const text = (await fig.locator('.sim-readout').textContent()) ?? '';
    const emf = Number(/ε = (-?[\d.]+) mV/.exec(text)?.[1]);
    const fromSlope = Number(/−N·ΔΦ\/Δt = (-?[\d.]+) mV/.exec(text)?.[1]);
    expect(Math.abs(emf)).toBeGreaterThan(5);
    expect(Math.abs(fromSlope - emf) / Math.abs(emf)).toBeLessThan(0.05);
    expect((await tasks(page))['fig-5-2b:read-slope']).toBeTruthy();
  });

  test('flipping the normal flips the signs on the graphs, not the needle', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-2b');
    await fig.getByRole('button', { name: 'מגנט וסליל' }).click();
    await fig.getByRole('button', { name: 'הפכו את האנך' }).click();
    await fig.getByRole('button', { name: 'הכניסו את המגנט' }).click();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('ΔΦ = -47.4 μWb');
    await expect(readout).toContainText('−NΔΦ/Δt = 15.8 mV');
    expect((await tasks(page))['fig-5-2b:flip-normal']).toBeTruthy();
  });

  test('in still mode nothing moves while the learner does nothing', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-2a');
    await fig.getByRole('button', { name: 'הכניסו את המגנט' }).click();
    const c = fig.locator('canvas');
    const a = await c.screenshot();
    await page.waitForTimeout(1000);
    const b = await c.screenshot();
    expect(a.equals(b)).toBe(true);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-2"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await hydrated(predict.locator('label.q-choice').first());
    await predict.locator('label.q-choice', { hasText: 'המחוג באפס' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the final flux instead of its change is caught as that misconception, then 0.9 passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.2-average-emf"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1.26');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.2-average-emf', correct: false, misconception: 'MC-faraday-emf-follows-flux', lesson: '5.2' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    // the signed emf is right but the question asks for the magnitude: told so, not just "wrong"
    await input.fill('-0.9');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הגודל');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.9');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "a magnet at rest drives a current" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.2-magnet-at-rest"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'גדולה פי 2' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.2-magnet-at-rest', correct: false, confident: true, misconception: 'MC-faraday-field-not-change' });
  });
});
