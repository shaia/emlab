import { expect, test, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-3/';

/** Still mode: the buttons set the magnet's velocity without moving it, so every reading is a fixed picture. */
async function openStill(page: Page, id: string) {
  await page.addInitScript(() => localStorage.setItem('emlab:settings', JSON.stringify({ still: true, theme: 'auto' })));
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
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
    expect(await canvases.count()).toBe(2);
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('a magnet at rest induces nothing; approaching N meets an N face and repels, receding attracts; flipped it still repels', async ({ page }) => {
    const fig = await openStill(page, 'fig-5-3a');
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('אין זרם מושרה');
    await fig.getByRole('button', { name: 'קרבו את המגנט' }).click();
    await expect(readout).toContainText('גדל');
    await expect(readout).toContainText('נגד כיוון השעון במבט מצד המגנט');
    await expect(readout).toContainText('קוטב צפוני (N)');
    await expect(readout).toContainText('דחייה');
    await fig.getByRole('button', { name: 'הרחיקו את המגנט' }).click();
    await expect(readout).toContainText('קטן');
    await expect(readout).toContainText('עם כיוון השעון במבט מצד המגנט');
    await expect(readout).toContainText('משיכה');
    await fig.getByRole('button', { name: 'הפכו את המגנט' }).click();
    await fig.getByRole('button', { name: 'קרבו את המגנט' }).click();
    await expect(readout).toContainText('קוטב דרומי (S)');
    await expect(readout).toContainText('דחייה');
    const tasks = (await progress(page)).tasks;
    for (const t of ['approach', 'recede', 'flip']) expect(tasks[`fig-5-3a:${t}`]).toBeTruthy();
  });

  test('with the current reversed the ring pulls the approaching magnet and energy appears from nowhere', async ({ page }) => {
    const fig = await openStill(page, 'fig-5-3a');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'מה אם הזרם הפוך?' }).click();
    await fig.getByRole('button', { name: 'קרבו את המגנט' }).click();
    await expect(readout).toContainText('משיכה');
    await expect(readout).toContainText('אנרגיה נוצרת מכלום');
    expect((await progress(page)).tasks['fig-5-3a:wrong']).toBeTruthy();
  });

  test('the tube: free fall in plastic, a terminal speed of 0.0401 m/s in copper', async ({ page }) => {
    const fig = await openStill(page, 'fig-5-3b');
    const readout = fig.locator('.sim-readout');
    await fig.getByRole('button', { name: 'פלסטיק' }).click();
    await fig.getByRole('button', { name: 'שחררו את המגנט' }).click();
    await expect(readout).toContainText('נפילה חופשית');
    await fig.getByRole('button', { name: 'נחושת' }).click();
    await fig.getByRole('button', { name: 'שחררו את המגנט' }).click();
    await expect(readout).toContainText('v_T = 0.0401 m/s');
    const tasks = (await progress(page)).tasks;
    for (const t of ['drop-plastic', 'drop-copper']) expect(tasks[`fig-5-3b:${t}`]).toBeTruthy();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-5-3"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'היא תידחה' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the weight instead of the power is told apart, then the right value passes', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.3-terminal-power"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.12');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('המשקל');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.0036');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident "a magnet at rest pushes the ring" is recorded as that misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.3-rest-magnet"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label', { hasText: 'כוח דחייה' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-5.3-rest-magnet', correct: false, confident: true, misconception: 'MC-lenz-force-without-motion' });
  });
});
