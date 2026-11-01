import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-5/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

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
    expect(await canvases.count()).toBe(2);
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('inside the sphere V is kQ/R everywhere; at twice the radius it is half that', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-5a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    // a text step may have changed the figure before the freeze: start from its own state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const canvas = fig.locator('canvas');
    const readout = fig.locator('.sim-readout');
    // 2 μC on a 20 cm sphere: kQ/R = 9·10⁴ V; at 45 cm kQ/r = 4·10⁴ V
    await expect(readout).toContainText('V = 4·10⁴ V');
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowLeft');
    await expect(readout).toContainText('בתוך הכדור');
    await expect(readout).toContainText('V = 9·10⁴ V');
    await expect(readout).toContainText('E = 0');
    await canvas.press('Shift+ArrowLeft');
    await expect(readout).toContainText('V = 9·10⁴ V');
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowRight');
    for (let i = 0; i < 5; i++) await canvas.press('ArrowRight');
    await expect(readout).toContainText('r = 40 cm');
    await expect(readout).toContainText('V = 4.5·10⁴ V');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-2-5a:inside-same']).toBeTruthy();
    expect(tasks['fig-2-5a:double-r']).toBeTruthy();
  });

  test('a wire shares charge by radius, earthing empties a lone sphere, and earthing near a charge leaves −qR/D', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-5b');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    // a text step may have changed the figure before the freeze: start from its own state
    await fig.getByRole('button', { name: 'איפוס' }).click();
    const readout = fig.locator('.sim-readout');
    const wire = fig.getByRole('button', { name: 'חיבור בתיל' });
    const earth = fig.getByRole('button', { name: 'הארקה של כדור 2' });
    const near = fig.getByRole('button', { name: 'מטען קרוב לכדור 2' });
    // equal 10 cm spheres, 6 μC on sphere 1: 3 μC each at kQ/(R₁+R₂) = 2.7·10⁵ V
    await wire.click();
    await expect(readout).toContainText('q₁ = +3 μC, V₁ = 2.7·10⁵ V');
    await expect(readout).toContainText('q₂ = +3 μC, V₂ = 2.7·10⁵ V');
    await wire.click();
    await setSlider(fig.locator('input[type=range]').first(), 0.2);
    await wire.click();
    await expect(readout).toContainText('q₁ = +2 μC');
    await expect(readout).toContainText('q₂ = +4 μC');
    await wire.click();
    await earth.click();
    await expect(readout).toContainText('q₂ = 0 μC');
    // 3 μC at 40 cm from the centre of the 20 cm sphere: −qR/D = −1.5 μC
    await near.click();
    await expect(readout).toContainText('q₂ = −1.5 μC');
    await earth.click();
    await near.click();
    await expect(readout).toContainText('q₂ = −1.5 μC');
    const tasks = (await progress(page)).tasks;
    for (const t of ['connect', 'size-share', 'ground', 'induce']) expect(tasks[`fig-2-5b:${t}`]).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-5"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'לכדור הגדול יעבור יותר' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: sharing half and half is caught as that misconception, then the right charge passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.5-share-numeric"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('חצי-חצי');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.5-share-numeric', correct: false, misconception: 'MC-equal-share-on-connect', lesson: '2.5' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "charge flows from the sphere with more charge" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.5-flow-direction"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'כי על B יש יותר מטען' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.5-flow-direction', correct: false, confident: true, misconception: 'MC-flow-from-more-charge' });
  });
});
