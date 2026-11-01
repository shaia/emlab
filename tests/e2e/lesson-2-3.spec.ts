import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-3/';

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

  test('dragging P along an equipotential circle keeps V fixed and ticks the task', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-3a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const canvas = fig.locator('canvas');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('V = 6·10⁴ V');
    const box = (await canvas.boundingBox())!;
    // world → page: 2 m × 1.15 m stage, y up; the charge is at (−0.2, 0) and P starts 30 cm to its right
    const ppm = Math.min(box.width / 2, box.height / 1.15);
    const at = (x: number, y: number) => [box.x + box.width / 2 + x * ppm, box.y + box.height / 2 - y * ppm] as const;
    const onCircle = (deg: number) => at(-0.2 + 0.3 * Math.cos((deg * Math.PI) / 180), 0.3 * Math.sin((deg * Math.PI) / 180));
    await page.mouse.move(...onCircle(0));
    await page.mouse.down();
    for (let d = 3; d <= 66; d += 3) await page.mouse.move(...onCircle(d));
    await page.mouse.up();
    await expect(readout).toContainText('V = 6·10⁴ V');
    expect((await progress(page)).tasks['fig-2-3a:follow-line']).toBeTruthy();
  });

  test('between the plates V falls in a straight line while E stays 500 V/m; zero field and zero potential part ways', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-3b');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await freezeSteps(page);
    const canvas = fig.locator('canvas');
    const readout = fig.locator('.sim-readout');
    // mid-gap: 400 V across 0.8 m
    await expect(readout).toContainText('V = 200 V');
    await expect(readout).toContainText('E = 500 V/m');
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowRight');
    await expect(readout).toContainText('V = 50 V');
    await expect(readout).toContainText('E = 500 V/m');

    await fig.getByRole('button', { name: 'שני מטענים זהים' }).click();
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowDown');
    await expect(readout).toContainText('V = 9·10⁴ V');
    await expect(readout).toContainText('E = 0');

    await fig.getByRole('button', { name: 'דיפול' }).click();
    await canvas.focus();
    for (let i = 0; i < 3; i++) await canvas.press('Shift+ArrowDown');
    await expect(readout).toContainText('הפוטנציאל ב-P: V = 0');
    await expect(readout).toContainText('E = 2.25·10⁵ N/C');
    const tasks = (await progress(page)).tasks;
    expect(tasks['fig-2-3b:plates-graph']).toBeTruthy();
    expect(tasks['fig-2-3b:e-zero']).toBeTruthy();
    expect(tasks['fig-2-3b:v-zero']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-3"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    await predict.locator('label.q-choice', { hasText: 'השדה שווה בכל המקומות' }).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: millimetres left unconverted get targeted feedback, then the right field passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.3-plates-field"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('50');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('מילימטר');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('5e4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "zero potential means no force" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.3-dipole-force"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'כי הפוטנציאל אפס' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-2.3-dipole-force', correct: false, confident: true, misconception: 'MC-zero-potential-zero-field' });
  });
});
