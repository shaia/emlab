import { expect, test, type Locator, type Page } from '@playwright/test';

const LESSON = '/lessons/1-9/';

// islands hydrate when scrolled into view: a click or fill before that is lost, so retry until the page reacts
async function fillUntilReady(q: Locator, input: Locator, value: string) {
  await expect(async () => {
    await input.fill(value);
    await expect(q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true })).toBeEnabled({ timeout: 500 });
  }).toPass();
}

async function chooseUntilReady(q: Locator, index: number) {
  await expect(async () => {
    await q.locator('.q-choices').first().locator('label').nth(index).click();
    await expect(q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true })).toBeEnabled({ timeout: 500 });
  }).toPass();
}

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

test.describe('live figures', () => {
  test('every simulation draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect
        .poll(() =>
          c.evaluate((el: HTMLCanvasElement) => {
            const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
            let inked = 0;
            for (let k = 3; k < d.length; k += 4 * 7) if (d[k] > 0) inked++;
            return inked;
          }),
        )
        .toBeGreaterThan(200);
    }
  });

  test('inserting the conductor ticks the task and shows the induced charge', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-9a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('.sim-readout')).not.toContainText('σ');
    await fig.getByRole('button', { name: 'מוליך', exact: true }).click();
    await expect(fig.locator('.sim-readout')).toContainText('σ = 3ε₀E₀');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-9a:insert-conductor']).toBeTruthy();
  });

  test('the field is zero when the probe is dragged into the conductor', async ({ page, isMobile }) => {
    test.skip(isMobile, 'touch drag is covered by pointer events; mouse drag checked on desktop');
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-9b');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect(readout).not.toContainText('E = 0 N/C');
    const box = (await fig.locator('canvas').boundingBox())!;
    const ppm = box.width / 2;
    // the probe starts at world (0.7, 0.28)
    const px = box.x + box.width / 2 + 0.7 * ppm;
    const py = box.y + box.height / 2 - 0.28 * ppm;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(readout).toContainText('E = 0 N/C');
    await expect(readout).toContainText('בתוך המתכת');
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-9"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').nth(2).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-9'].choice).toBe('2');
  });
});

test.describe('questions', () => {
  test('a confident wrong choice is recorded with its misconception; retry then succeeds', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.9-inside-field"]');
    await q.scrollIntoViewIfNeeded();
    await chooseUntilReady(q, 1);
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.9-inside-field', correct: false, confident: true, misconception: 'MC-conductor-partial-shield', lesson: '1.9' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.locator('.q-choices').first().locator('label').nth(0).click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric: the half-plane value gets targeted feedback', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.9-sigma-field"]');
    await q.scrollIntoViewIfNeeded();
    const input = q.locator('input[type=text]');
    await fillUntilReady(q, input, '1.13e3');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('לוח אינסופי');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await fillUntilReady(q, input, '2.26e3');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('vector: a field along the surface is the tangential-field misconception', async ({ page }) => {
    await page.goto(LESSON);
    const v = page.locator('[data-qid="Q-1.9-surface-direction"]');
    await v.scrollIntoViewIfNeeded();
    await v.getByRole('radio', { name: 'ימינה', exact: true }).click();
    await v.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(v.locator('.q-feedback')).toContainText('מחליקים');
  });
});

test.describe('lesson completion', () => {
  test('finishing stamps the lesson', async ({ page }) => {
    await page.goto(LESSON);
    const end = page.getByRole('button', { name: /סיימתי את השיעור/ });
    await end.scrollIntoViewIfNeeded();
    await end.click();
    await expect(page.locator('.stamp')).toBeVisible();
  });
});
