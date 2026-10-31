import { expect, test, type Locator, type Page } from '@playwright/test';

const LESSON = '/lessons/1-6/';

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

  test('doubling the charge doubles the number of lines, and ticks the task', async ({ page }) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-1-6a');
    await fig.scrollIntoViewIfNeeded();
    const readout = fig.locator('.sim-readout');
    await expect(readout).toContainText('קווים לכל מטען');
    await expect(readout).toContainText('+2 μC: 12');
    // select the charge: it sits at (-0.25, 0) on a 2 m x 1.5 m stage centred on the canvas
    const box = (await fig.locator('canvas').boundingBox())!;
    const ppm = box.width / 2;
    await page.mouse.click(box.x + box.width / 2 - 0.25 * ppm, box.y + box.height / 2);
    const slider = fig.locator('input[type=range]').first();
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '4';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(readout).toContainText('+4 μC: 24');
    await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
    expect((await progress(page)).tasks['fig-1-6a:lines-double']).toBeTruthy();
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-6"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').nth(2).click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-6'].choice).toBe('2');
  });
});

test.describe('questions', () => {
  test('numeric: the line count taken as the charge gets targeted feedback', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.6-ratio-lines"]');
    await q.scrollIntoViewIfNeeded();
    const input = q.locator('input[type=text]');
    await fillUntilReady(q, input, '6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('מספר הקווים, לא המטען');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await fillUntilReady(q, input, '1.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a confident wrong choice is recorded with its misconception', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.6-like-middle"]');
    await q.scrollIntoViewIfNeeded();
    await chooseUntilReady(q, 1);
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.6-like-middle', correct: false, confident: true, misconception: 'MC-lines-connect-like', lesson: '1.6' });
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
